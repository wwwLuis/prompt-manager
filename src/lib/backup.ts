import { get } from "svelte/store";
import { templates, snippets, extractSnippetRefs, type Template, type Snippet } from "./store";

/* ═══════════════════════════════════════════
   Auto-Backup Service
   ═══════════════════════════════════════════ */

const BACKUP_SETTINGS_KEY = "pm-backup-settings";
const LAST_BACKUP_KEY = "pm-last-backup";

export interface BackupSettings {
  enabled: boolean;
  folderPath: string; // user-chosen backup folder
}

export function loadBackupSettings(): BackupSettings {
  try {
    const raw = localStorage.getItem(BACKUP_SETTINGS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { enabled: true, folderPath: "" }; // enabled by default, folderPath set on first run
}

/** Get the default backup folder: ./backup next to the EXE */
export async function getDefaultBackupFolder(): Promise<string> {
  try {
    const { resourceDir } = await import("@tauri-apps/api/path");
    const exeDir = await resourceDir();
    return exeDir.replace(/[/\\]$/, "") + "/backup";
  } catch {
    return "./backup";
  }
}

export function saveBackupSettings(settings: BackupSettings) {
  localStorage.setItem(BACKUP_SETTINGS_KEY, JSON.stringify(settings));
}

function getLastBackupDate(): string | null {
  return localStorage.getItem(LAST_BACKUP_KEY);
}

function setLastBackupDate(date: string) {
  localStorage.setItem(LAST_BACKUP_KEY, date);
}

/** Check if a backup is needed (Monday or no backup this week) */
export function isBackupNeeded(): boolean {
  const now = new Date();
  const lastBackup = getLastBackupDate();

  if (!lastBackup) return true; // never backed up

  const lastDate = new Date(lastBackup);
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon

  // Get the Monday of the current week
  const currentMonday = new Date(now);
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  currentMonday.setDate(now.getDate() + diff);
  currentMonday.setHours(0, 0, 0, 0);

  // If last backup is before this week's Monday → backup needed
  return lastDate < currentMonday;
}

/** Build the export payload (same format as manual export) */
function buildExportPayload(): string {
  const allTemplates = get(templates);
  const allSnippets = get(snippets);

  // Collect all referenced snippets
  const referencedKeys = new Set<string>();
  for (const t of allTemplates) {
    const refs = extractSnippetRefs(t.body);
    refs.forEach((r) => referencedKeys.add(r));
    for (const opt of t.optionals) {
      extractSnippetRefs(opt).forEach((r) => referencedKeys.add(r));
    }
    for (const group of t.eitherOrs ?? []) {
      for (const opt of group) {
        extractSnippetRefs(opt).forEach((r) => referencedKeys.add(r));
      }
    }
  }

  const snippetsToExport = allSnippets.filter((s) => referencedKeys.has(s.key));

  return JSON.stringify(
    { version: 1, templates: allTemplates, snippets: snippetsToExport.length > 0 ? snippetsToExport : allSnippets },
    null,
    2
  );
}

/** Perform the auto-backup to the configured folder */
export async function performAutoBackup(folderPath: string): Promise<boolean> {
  try {
    const { mkdir, writeTextFile, exists } = await import("@tauri-apps/plugin-fs");

    // Ensure folder exists
    const folderExists = await exists(folderPath);
    if (!folderExists) {
      await mkdir(folderPath, { recursive: true });
    }

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const fileName = `prompts-backup-${dateStr}.json`;
    const filePath = folderPath.replace(/[/\\]$/, "") + "/" + fileName;

    const payload = buildExportPayload();
    await writeTextFile(filePath, payload);

    setLastBackupDate(now.toISOString());
    return true;
  } catch (err) {
    console.error("Auto-backup failed:", err);
    return false;
  }
}

/** Choose backup folder via native dialog */
export async function chooseBackupFolder(): Promise<string | null> {
  try {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Backup-Ordner auswählen",
    });
    return selected as string | null;
  } catch {
    return null;
  }
}

/** Run on app startup: check if backup needed and perform it */
export async function checkAndRunAutoBackup(): Promise<{ ran: boolean; success: boolean }> {
  let settings = loadBackupSettings();

  // Set default folder if not configured yet
  if (!settings.folderPath) {
    const defaultFolder = await getDefaultBackupFolder();
    settings = { ...settings, folderPath: defaultFolder };
    saveBackupSettings(settings);
  }

  if (!settings.enabled) {
    return { ran: false, success: false };
  }

  if (!isBackupNeeded()) {
    return { ran: false, success: false };
  }

  const success = await performAutoBackup(settings.folderPath);
  return { ran: true, success };
}
