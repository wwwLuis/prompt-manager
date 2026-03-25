<script lang="ts">
  import { fly, fade, scale } from "svelte/transition";
  import { promptHistory, type HistoryEntry } from "./store";

  export let onBack: () => void;

  let copied: string | null = null;
  let confirmClear = false;

  $: entries = $promptHistory;

  function formatDate(ts: number): string {
    const d = new Date(ts);
    const now = new Date();
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();
    const time = d.toLocaleTimeString("de-DE", {
      hour: "2-digit",
      minute: "2-digit",
    });
    if (isToday) return `Heute, ${time}`;
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (
      d.getDate() === yesterday.getDate() &&
      d.getMonth() === yesterday.getMonth() &&
      d.getFullYear() === yesterday.getFullYear()
    )
      return `Gestern, ${time}`;
    return d.toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }) + `, ${time}`;
  }

  async function copyEntry(entry: HistoryEntry) {
    try {
      await navigator.clipboard.writeText(entry.prompt);
      copied = entry.id;
      setTimeout(() => (copied = null), 1800);
    } catch {}
  }

  function handleClear() {
    if (!confirmClear) {
      confirmClear = true;
      setTimeout(() => (confirmClear = false), 3000);
      return;
    }
    promptHistory.clear();
    confirmClear = false;
  }
</script>

<div class="history">
  <!-- Header -->
  <div class="header">
    <button class="back-btn" on:click={onBack} title="Zurück">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <line x1="19" y1="12" x2="5" y2="12" />
        <polyline points="12 19 5 12 12 5" />
      </svg>
    </button>
    <div class="header-info">
      <h2>Historie</h2>
      <span class="count">{entries.length} Einträge</span>
    </div>
    {#if entries.length > 0}
      <button
        class="btn-secondary clear-btn"
        class:danger-confirm={confirmClear}
        on:click={handleClear}
      >
        {#if confirmClear}
          Wirklich löschen?
        {:else}
          Alle löschen
        {/if}
      </button>
    {/if}
  </div>

  {#if entries.length === 0}
    <div class="empty" in:fade={{ duration: 150 }}>
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0.3">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
      <p>Noch keine Prompts kopiert.</p>
      <p class="empty-hint">Kopierte Prompts erscheinen hier automatisch.</p>
    </div>
  {:else}
    <div class="entry-list">
      {#each entries as entry, i (entry.id)}
        <div
          class="entry"
          in:fly={{ y: 8, duration: 150, delay: Math.min(i * 30, 300) }}
        >
          <div class="entry-header">
            <span class="entry-template">{entry.templateName}</span>
            <span class="entry-time">{formatDate(entry.timestamp)}</span>
          </div>
          <pre class="entry-prompt">{entry.prompt}</pre>
          <div class="entry-actions">
            <button class="btn-secondary copy-btn" on:click={() => copyEntry(entry)}>
              {#if copied === entry.id}
                <span class="copy-content" in:scale={{ duration: 150 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Kopiert
                </span>
              {:else}
                <span class="copy-content">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  Kopieren
                </span>
              {/if}
            </button>
            <button class="icon-btn danger" on:click={() => promptHistory.remove(entry.id)} title="Entfernen">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .history {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 4px;
  }

  .header-info {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
  }

  h2 {
    font-size: 19px;
    font-weight: 600;
    color: var(--text);
    letter-spacing: -0.02em;
  }

  .count {
    font-size: 12px;
    color: var(--text-muted);
  }

  .back-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    background: var(--bg-card);
    border: 1.5px solid var(--border-light);
    border-radius: var(--radius);
    color: var(--text-secondary);
    transition: all var(--transition);
    flex-shrink: 0;
  }

  .back-btn:hover {
    background: var(--bg-hover);
    color: var(--text);
    border-color: var(--border);
    transform: translateX(-2px);
  }

  .clear-btn {
    font-size: 12px;
    padding: 6px 12px;
    flex-shrink: 0;
  }

  .danger-confirm {
    background: var(--danger-bg);
    color: var(--danger);
    border-color: var(--danger);
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 48px 20px;
    text-align: center;
  }

  .empty p {
    font-size: 14px;
    color: var(--text-muted);
    margin: 0;
  }

  .empty-hint {
    font-size: 12px !important;
    color: var(--text-muted);
    opacity: 0.7;
  }

  .entry-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .entry {
    background: var(--bg-card);
    border: 1.5px solid var(--border-light);
    border-radius: var(--radius-lg);
    padding: 16px;
    transition: all var(--transition);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .entry:hover {
    border-color: var(--border);
  }

  .entry-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .entry-template {
    font-size: 13px;
    font-weight: 600;
    color: var(--accent);
  }

  .entry-time {
    font-size: 11px;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .entry-prompt {
    font-size: 12px;
    font-family: "SF Mono", "Cascadia Code", "Consolas", monospace;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--text-secondary);
    background: var(--bg);
    border-radius: var(--radius);
    padding: 12px;
    margin: 0;
    max-height: 120px;
    overflow: auto;
    line-height: 1.55;
  }

  .entry-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    justify-content: flex-end;
  }

  .copy-btn {
    font-size: 12px;
    padding: 5px 10px;
  }

  .copy-content {
    display: flex;
    align-items: center;
    gap: 5px;
  }
</style>
