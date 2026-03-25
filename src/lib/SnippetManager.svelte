<script lang="ts">
  import { fly, fade, slide, scale } from "svelte/transition";
  import { flip } from "svelte/animate";
  import { snippets, genId, type Snippet } from "./store";

  export let onBack: () => void;

  // ── Edit state ──
  let editing: Snippet | null = null;
  let editKey = "";
  let editValue = "";
  let editDesc = "";

  $: sorted = [...$snippets].sort((a, b) => a.key.localeCompare(b.key));
  $: canSave =
    editKey.trim().length > 0 &&
    editValue.trim().length > 0 &&
    isKeyUnique(editKey.trim(), editing?.id);

  function isKeyUnique(key: string, excludeId?: string): boolean {
    return !$snippets.some(
      (s) => s.key.toLowerCase() === key.toLowerCase() && s.id !== excludeId
    );
  }

  function startNew() {
    editing = null;
    editKey = "";
    editValue = "";
    editDesc = "";
    showForm = true;
  }

  function startEdit(s: Snippet) {
    editing = s;
    editKey = s.key;
    editValue = s.value;
    editDesc = s.description;
    showForm = true;
  }

  function cancelEdit() {
    editing = null;
    editKey = "";
    editValue = "";
    editDesc = "";
    showForm = false;
  }

  function handleSave() {
    if (!canSave) return;
    snippets.save({
      id: editing?.id || genId(),
      key: editKey.trim(),
      value: editValue.trim(),
      description: editDesc.trim(),
    });
    cancelEdit();
  }

  function handleDelete(id: string) {
    snippets.remove(id);
    if (editing?.id === id) cancelEdit();
  }

  let showForm = false;
</script>

<div class="snippets">
  <!-- Header -->
  <div class="header">
    <button class="back-btn" on:click={onBack} title="Zurück">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <line x1="19" y1="12" x2="5" y2="12" />
        <polyline points="12 19 5 12 12 5" />
      </svg>
    </button>
    <div>
      <h2>Snippets & Konstanten</h2>
      <p class="subtitle">Wiederverwendbare Bausteine für deine Templates</p>
    </div>
  </div>

  <!-- Info -->
  <div class="info-box" in:fade={{ duration: 150 }}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
    </svg>
    <span>Verwende <code>[[key]]</code> in deinen Templates, um Snippets automatisch einzusetzen.</span>
  </div>

  <!-- New / Edit form -->
  {#if showForm}
    <div class="form" transition:slide={{ duration: 150 }}>
      <div class="form-header">
        <h3>{editing ? "Snippet bearbeiten" : "Neues Snippet"}</h3>
      </div>

      <div class="form-fields">
        <div class="field-row">
          <div class="field key-field">
            <label class="label" for="snip-key">Key</label>
            <div class="key-input-wrap">
              <span class="key-bracket">[[</span>
              <input
                id="snip-key"
                bind:value={editKey}
                placeholder="mein_snippet"
                class="key-input"
              />
              <span class="key-bracket">]]</span>
            </div>
            {#if editKey.trim() && !isKeyUnique(editKey.trim(), editing?.id)}
              <span class="field-error" in:fade={{ duration: 100 }}>Key existiert bereits</span>
            {/if}
          </div>
        </div>

        <div class="field">
          <label class="label" for="snip-desc">Beschreibung <span class="optional-hint">(optional)</span></label>
          <input
            id="snip-desc"
            bind:value={editDesc}
            placeholder="z. B. Mein Standard-Coding-Style"
          />
        </div>

        <div class="field">
          <label class="label" for="snip-value">Inhalt</label>
          <textarea
            id="snip-value"
            bind:value={editValue}
            placeholder="Der Text, der eingefügt wird…"
            rows="4"
          ></textarea>
        </div>
      </div>

      <div class="form-actions">
        <button class="btn-secondary" on:click={cancelEdit}>Abbrechen</button>
        <button class="btn-primary" disabled={!canSave} on:click={handleSave}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Speichern
        </button>
      </div>
    </div>
  {:else}
    <button class="btn-new" on:click={startNew} in:fade={{ duration: 120 }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
      </svg>
      Neues Snippet erstellen
    </button>
  {/if}

  <!-- List -->
  {#if sorted.length === 0 && !showForm}
    <div class="empty" in:fade={{ duration: 200 }}>
      <div class="empty-icon">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
          <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
        </svg>
      </div>
      <p>Noch keine Snippets vorhanden.</p>
    </div>
  {:else if sorted.length > 0}
    <div class="snippet-list">
      {#each sorted as s (s.id)}
        <div
          class="snippet-card"
          class:active={editing?.id === s.id}
          animate:flip={{ duration: 200 }}
          in:fly={{ y: 8, duration: 150 }}
          out:fade={{ duration: 100 }}
        >
          <div class="snippet-header">
            <div class="snippet-key-row">
              <code class="snippet-key">[[{s.key}]]</code>
              {#if s.description}
                <span class="snippet-desc">{s.description}</span>
              {/if}
            </div>
            <div class="snippet-actions">
              <button
                class="icon-btn"
                on:click={() => startEdit(s)}
                title="Bearbeiten"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
              <button
                class="icon-btn danger"
                on:click={() => handleDelete(s.id)}
                title="Löschen"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6" /><path d="M14 11v6" />
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
              </button>
            </div>
          </div>
          <pre class="snippet-value">{s.value}</pre>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .snippets {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .header {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 4px;
  }

  h2 {
    font-size: 19px;
    font-weight: 600;
    color: var(--text);
    letter-spacing: -0.02em;
  }

  .subtitle {
    font-size: 12.5px;
    color: var(--text-muted);
    margin-top: 2px;
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

  /* ── Info Box ── */
  .info-box {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    background: var(--accent-bg);
    border: 1px solid var(--accent-border);
    border-radius: var(--radius);
    font-size: 12.5px;
    color: var(--text-secondary);
  }

  .info-box svg {
    flex-shrink: 0;
    color: var(--accent);
  }

  .info-box code {
    font-family: "SF Mono", "Cascadia Code", "Consolas", monospace;
    font-size: 12px;
    background: var(--bg-card);
    padding: 1px 6px;
    border-radius: 4px;
    color: var(--accent);
    font-weight: 600;
  }

  /* ── New button ── */
  .btn-new {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 14px;
    font-size: 13.5px;
    font-weight: 500;
    color: var(--text-muted);
    background: var(--bg-card);
    border: 2px dashed var(--border);
    border-radius: var(--radius-lg);
    transition: all var(--transition);
  }

  .btn-new:hover {
    color: var(--accent);
    border-color: var(--accent-border);
    background: var(--accent-bg);
  }

  /* ── Form ── */
  .form {
    background: var(--bg-card);
    border: 1.5px solid var(--border-light);
    border-radius: var(--radius-lg);
    padding: 20px;
  }

  .form-header {
    margin-bottom: 16px;
  }

  h3 {
    font-size: 15px;
    font-weight: 600;
    color: var(--text);
  }

  .form-fields {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .field {
    display: flex;
    flex-direction: column;
  }

  .field-row {
    display: flex;
    gap: 12px;
  }

  .key-field {
    flex: 1;
  }

  .key-input-wrap {
    display: flex;
    align-items: center;
    gap: 0;
    background: var(--bg);
    border: 1.5px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    transition: border-color var(--transition), box-shadow var(--transition);
  }

  .key-input-wrap:focus-within {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.12);
  }

  .key-bracket {
    font-family: "SF Mono", "Cascadia Code", "Consolas", monospace;
    font-size: 13px;
    font-weight: 600;
    color: var(--accent);
    padding: 0 6px;
    user-select: none;
    flex-shrink: 0;
  }

  .key-input {
    border: none !important;
    background: transparent !important;
    box-shadow: none !important;
    padding: 10px 4px;
    font-family: "SF Mono", "Cascadia Code", "Consolas", monospace;
    font-size: 13.5px;
    font-weight: 500;
    min-width: 0;
  }

  .key-input:focus {
    box-shadow: none !important;
  }

  .optional-hint {
    font-weight: 400;
    text-transform: none;
    letter-spacing: normal;
  }

  .field-error {
    font-size: 11px;
    color: var(--danger);
    margin-top: 4px;
    font-weight: 500;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
  }

  /* ── Snippet List ── */
  .snippet-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .snippet-card {
    background: var(--bg-card);
    border: 1.5px solid var(--border-light);
    border-radius: var(--radius-lg);
    padding: 14px 16px;
    transition: all var(--transition);
  }

  .snippet-card:hover {
    border-color: var(--border);
    box-shadow: var(--shadow-sm);
  }

  .snippet-card.active {
    border-color: var(--accent-border);
    background: var(--accent-bg);
  }

  .snippet-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 8px;
  }

  .snippet-key-row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    min-width: 0;
  }

  .snippet-key {
    font-family: "SF Mono", "Cascadia Code", "Consolas", monospace;
    font-size: 13px;
    font-weight: 600;
    color: var(--accent);
    background: var(--accent-bg);
    padding: 2px 8px;
    border-radius: 6px;
    white-space: nowrap;
  }

  .snippet-desc {
    font-size: 12.5px;
    color: var(--text-muted);
    font-weight: 400;
  }

  .snippet-actions {
    display: flex;
    gap: 2px;
    flex-shrink: 0;
    opacity: 0;
    transition: opacity var(--transition);
  }

  .snippet-card:hover .snippet-actions {
    opacity: 1;
  }

  .snippet-value {
    font-family: "SF Mono", "Cascadia Code", "Consolas", monospace;
    font-size: 12px;
    line-height: 1.6;
    color: var(--text-secondary);
    background: var(--bg);
    border-radius: 8px;
    padding: 10px 12px;
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
    max-height: 120px;
    overflow: auto;
  }

  /* ── Empty ── */
  .empty {
    text-align: center;
    padding: 48px 0;
    color: var(--text-muted);
  }

  .empty-icon {
    margin-bottom: 12px;
    opacity: 0.35;
  }

  .empty p {
    font-size: 14px;
  }
</style>
