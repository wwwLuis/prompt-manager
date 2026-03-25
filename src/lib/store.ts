import { writable, derived } from "svelte/store";

/* ═══════════════════════════════════════════
   Templates
   ═══════════════════════════════════════════ */

export interface Template {
  id: string;
  name: string;
  body: string;
  placeholders: string[];
  /** Placeholders that should render as textarea (multiline) */
  textareas: string[];
  optionals: string[];
  /** Either/Or groups: each group is an array of alternatives (pick one) */
  eitherOrs: string[][];
  category: string[];
  favorite: boolean;
}

const TPL_KEY = "prompt-manager-templates";

function loadTemplates(): Template[] {
  try {
    const raw = localStorage.getItem(TPL_KEY);
    if (!raw) return [];
    const parsed: Template[] = JSON.parse(raw);
    return parsed.map((t: any) => ({
      ...t,
      textareas: t.textareas ?? [],
      eitherOrs: t.eitherOrs ?? [],
      category: Array.isArray(t.category)
        ? t.category
        : t.category ? [t.category] : [],
    }));
  } catch {
    return [];
  }
}

function createTemplateStore() {
  const { subscribe, set, update } = writable<Template[]>(loadTemplates());

  subscribe((ts) => {
    try {
      localStorage.setItem(TPL_KEY, JSON.stringify(ts));
    } catch {}
  });

  return {
    subscribe,

    save(t: Template) {
      update((ts) => {
        const i = ts.findIndex((x) => x.id === t.id);
        if (i >= 0) {
          const copy = [...ts];
          copy[i] = t;
          return copy;
        }
        return [...ts, t];
      });
    },

    remove(id: string) {
      update((ts) => ts.filter((t) => t.id !== id));
    },

    toggleFav(id: string) {
      update((ts) =>
        ts.map((t) => (t.id === id ? { ...t, favorite: !t.favorite } : t))
      );
    },

    importBatch(incoming: Template[]) {
      update((ts) => {
        const existingIds = new Set(ts.map((t) => t.id));
        const newOnes = incoming
          .map((t: any) => ({
            ...t,
            textareas: t.textareas ?? [],
            eitherOrs: t.eitherOrs ?? [],
            category: Array.isArray(t.category)
              ? t.category
              : t.category ? [t.category] : [],
          }))
          .filter((t) => !existingIds.has(t.id));
        return [...ts, ...newOnes];
      });
    },
  };
}

export const templates = createTemplateStore();

export const categories = derived(templates, ($ts) =>
  [...new Set($ts.flatMap((t) => t.category).filter(Boolean))].sort()
);

/* ═══════════════════════════════════════════
   Snippets / Constants
   ═══════════════════════════════════════════ */

export interface Snippet {
  id: string;
  /** Short key used inside templates: [[key]] */
  key: string;
  /** The text this snippet expands to */
  value: string;
  /** Optional description / note */
  description: string;
}

const SNIP_KEY = "prompt-manager-snippets";

function loadSnippets(): Snippet[] {
  try {
    const raw = localStorage.getItem(SNIP_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function createSnippetStore() {
  const { subscribe, set, update } = writable<Snippet[]>(loadSnippets());

  subscribe((ss) => {
    try {
      localStorage.setItem(SNIP_KEY, JSON.stringify(ss));
    } catch {}
  });

  return {
    subscribe,

    save(s: Snippet) {
      update((ss) => {
        const i = ss.findIndex((x) => x.id === s.id);
        if (i >= 0) {
          const copy = [...ss];
          copy[i] = s;
          return copy;
        }
        return [...ss, s];
      });
    },

    remove(id: string) {
      update((ss) => ss.filter((s) => s.id !== id));
    },

    importBatch(incoming: Snippet[]) {
      update((ss) => {
        const existingIds = new Set(ss.map((s) => s.id));
        const newOnes = incoming.filter((s) => !existingIds.has(s.id));
        return [...ss, ...newOnes];
      });
    },
  };
}

export const snippets = createSnippetStore();

/** Build a lookup map: key → value */
export const snippetMap = derived(snippets, ($ss) => {
  const map = new Map<string, string>();
  for (const s of $ss) {
    map.set(s.key, s.value);
  }
  return map;
});

/** Replace all [[key]] references in a text with snippet values */
export function applySnippets(text: string, map: Map<string, string>): string {
  return text.replace(/\[\[(\w+)\]\]/g, (match, key) => {
    return map.get(key) ?? match;
  });
}

/** Extract all [[key]] references from text */
export function extractSnippetRefs(text: string): string[] {
  const m = text.match(/\[\[(\w+)\]\]/g) || [];
  return [...new Set(m.map((x) => x.slice(2, -2)))];
}

/* ═══════════════════════════════════════════
   Prompt History
   ═══════════════════════════════════════════ */

export interface HistoryEntry {
  id: string;
  templateName: string;
  prompt: string;
  timestamp: number;
}

const HIST_KEY = "prompt-manager-history";
const HIST_MAX = 50;

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HIST_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function createHistoryStore() {
  const { subscribe, set, update } = writable<HistoryEntry[]>(loadHistory());

  subscribe((entries) => {
    try {
      localStorage.setItem(HIST_KEY, JSON.stringify(entries));
    } catch {}
  });

  return {
    subscribe,

    add(templateName: string, prompt: string) {
      update((entries) => {
        const entry: HistoryEntry = {
          id: genId(),
          templateName,
          prompt,
          timestamp: Date.now(),
        };
        return [entry, ...entries].slice(0, HIST_MAX);
      });
    },

    remove(id: string) {
      update((entries) => entries.filter((e) => e.id !== id));
    },

    clear() {
      set([]);
    },
  };
}

export const promptHistory = createHistoryStore();

/* ═══════════════════════════════════════════
   Utilities
   ═══════════════════════════════════════════ */

export function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function extractPlaceholders(text: string): string[] {
  const m = text.match(/\{\{(\w+)\}\}/g) || [];
  return [...new Set(m.map((x) => x.slice(2, -2)))];
}
