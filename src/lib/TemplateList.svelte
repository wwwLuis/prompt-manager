<script lang="ts">
  import { fly, fade, scale, slide } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import { getContext } from "svelte";
  import type { Writable } from "svelte/store";
  import { templates, categories, snippets, extractSnippetRefs, type Template, type Snippet } from "./store";

  export let onNew: () => void;
  export let onEdit: (t: Template) => void;
  export let onUse: (t: Template) => void;
  export let onSnippets: () => void;
  export let onHistory: () => void;

  const theme = getContext<Writable<"light" | "dark">>("theme");
  const toggleTheme = getContext<() => void>("toggleTheme");

  let search = "";
  let filterCat = "";
  let showFavsOnly = false;
  // Bump this on every filter change so Svelte treats all cards as new
  let filterGeneration = 0;

  function setFilter(cat: string) {
    filterCat = filterCat === cat ? "" : cat;
    filterGeneration++;
  }

  function setFavs(val: boolean) {
    showFavsOnly = val;
    filterGeneration++;
  }

  function clearFilters() {
    filterCat = "";
    showFavsOnly = false;
    filterGeneration++;
  }

  // ── Export mode ──
  let exportMode = false;
  let selected: Set<string> = new Set();

  // ── Toast state ──
  let toastMessage = "";
  let showToast = false;
  let fileInput: HTMLInputElement;

  function flash(msg: string, duration = 3000) {
    toastMessage = msg;
    showToast = true;
    setTimeout(() => (showToast = false), duration);
  }

  $: filtered = $templates
    .filter((t) => {
      if (showFavsOnly && !t.favorite) return false;
      if (filterCat && !t.category.includes(filterCat)) return false;
      if (search && !t.name.toLowerCase().includes(search.toLowerCase()))
        return false;
      return true;
    })
    .sort((a, b) => {
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  $: allSelected = filtered.length > 0 && filtered.every((t) => selected.has(t.id));
  $: someSelected = selected.size > 0;

  function enterExportMode() {
    exportMode = true;
    selected = new Set();
  }

  function exitExportMode() {
    exportMode = false;
    selected = new Set();
  }

  function toggleSelect(id: string) {
    if (selected.has(id)) {
      selected.delete(id);
    } else {
      selected.add(id);
    }
    selected = new Set(selected);
  }

  function toggleAll() {
    if (allSelected) {
      selected = new Set();
    } else {
      selected = new Set(filtered.map((t) => t.id));
    }
  }

  function doExport() {
    const tplExport = $templates.filter((t) => selected.has(t.id));
    if (tplExport.length === 0) return;

    // Collect all unique snippet keys referenced in selected templates
    const usedKeys = new Set<string>();
    for (const t of tplExport) {
      for (const key of extractSnippetRefs(t.body)) {
        usedKeys.add(key);
      }
      // Also check optionals for snippet refs
      for (const opt of t.optionals) {
        for (const key of extractSnippetRefs(opt)) {
          usedKeys.add(key);
        }
      }
      // Also check either/or groups for snippet refs
      for (const group of t.eitherOrs ?? []) {
        for (const opt of group) {
          for (const key of extractSnippetRefs(opt)) {
            usedKeys.add(key);
          }
        }
      }
    }

    const snipExport = $snippets.filter((s) => usedKeys.has(s.key));

    const exportData = {
      version: 1,
      templates: tplExport,
      snippets: snipExport,
    };

    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    const date = new Date().toISOString().slice(0, 10);
    a.download = `prompts-export-${date}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    exitExportMode();

    const parts: string[] = [];
    parts.push(`${tplExport.length} Template${tplExport.length !== 1 ? "s" : ""}`);
    if (snipExport.length > 0) {
      parts.push(`${snipExport.length} Snippet${snipExport.length !== 1 ? "s" : ""}`);
    }
    flash(`${parts.join(" + ")} exportiert — die Datei liegt im Download-Ordner`);
  }

  function triggerImport() {
    fileInput.click();
  }

  async function handleImportFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      let tplArr: Template[] = [];
      let snipArr: Snippet[] = [];

      if (Array.isArray(data)) {
        // Legacy format: plain array of templates
        tplArr = data;
      } else if (data && typeof data === "object" && data.templates) {
        // New format: { version, templates, snippets }
        tplArr = Array.isArray(data.templates) ? data.templates : [];
        snipArr = Array.isArray(data.snippets) ? data.snippets : [];
      }

      // Validate templates
      const validTpl = tplArr.filter(
        (t) => t && typeof t.id === "string" && typeof t.name === "string" && typeof t.body === "string"
      );

      // Validate snippets
      const validSnip = snipArr.filter(
        (s) => s && typeof s.id === "string" && typeof s.key === "string" && typeof s.value === "string"
      );

      if (validTpl.length > 0) templates.importBatch(validTpl);
      if (validSnip.length > 0) snippets.importBatch(validSnip);

      if (validTpl.length > 0 || validSnip.length > 0) {
        const parts: string[] = [];
        if (validTpl.length > 0) parts.push(`${validTpl.length} Template${validTpl.length !== 1 ? "s" : ""}`);
        if (validSnip.length > 0) parts.push(`${validSnip.length} Snippet${validSnip.length !== 1 ? "s" : ""}`);
        flash(`${parts.join(" + ")} importiert`);
      }
    } catch {
      // Invalid JSON – silently ignore
    }

    // Reset file input so same file can be re-imported
    input.value = "";
  }

  function handleDelete(e: MouseEvent, id: string) {
    e.stopPropagation();
    templates.remove(id);
  }

  function handleFav(e: MouseEvent, id: string) {
    e.stopPropagation();
    templates.toggleFav(id);
  }

  function handleEdit(e: MouseEvent, t: Template) {
    e.stopPropagation();
    onEdit(t);
  }

  function handleCardClick(t: Template) {
    if (exportMode) {
      toggleSelect(t.id);
    } else {
      onUse(t);
    }
  }
</script>

<!-- Hidden file input for import -->
<input
  bind:this={fileInput}
  type="file"
  accept=".json"
  on:change={handleImportFile}
  class="sr-only"
/>

<!-- Header -->
<div class="header">
  <div>
    <h1>Prompt Manager</h1>
    <p class="subtitle">
      {$templates.length} Template{$templates.length !== 1 ? "s" : ""}
    </p>
  </div>
  <div class="header-actions">
    {#if !exportMode}
      <button class="btn-icon-label" on:click={toggleTheme} title="Theme wechseln">
        {#if $theme === "light"}
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          </svg>
        {:else}
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="5"/>
            <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
            <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
          </svg>
        {/if}
      </button>
      <button class="btn-icon-label" on:click={onHistory} title="Prompt-Historie">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
      </button>
      <button class="btn-icon-label" on:click={onSnippets} title="Snippets & Konstanten">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
          <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
        </svg>
      </button>
      {#if $templates.length > 0}
        <button class="btn-icon-label" on:click={enterExportMode} title="Templates exportieren">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </button>
      {/if}
      <button class="btn-icon-label" on:click={triggerImport} title="Templates importieren">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
      </button>
      <button class="btn-primary" on:click={onNew}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Neu
      </button>
    {/if}
  </div>
</div>

<!-- Export toolbar -->
{#if exportMode}
  <div class="export-bar" transition:slide={{ duration: 150 }}>
    <div class="export-bar-left">
      <button class="select-all-btn" on:click={toggleAll}>
        <div class="checkbox-mini" class:checked={allSelected}>
          {#if allSelected}
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" in:scale={{ duration: 120 }}>
              <polyline points="20 6 9 17 4 12" />
            </svg>
          {/if}
        </div>
        Alle auswählen
      </button>
      <span class="export-count">{selected.size} ausgewählt</span>
    </div>
    <div class="export-bar-right">
      <button class="btn-secondary" on:click={exitExportMode}>Abbrechen</button>
      <button class="btn-primary" disabled={!someSelected} on:click={doExport}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        Exportieren ({selected.size})
      </button>
    </div>
  </div>
{/if}

<!-- Toast -->
{#if showToast}
  <div class="toast" transition:fly={{ y: -10, duration: 200 }}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
    {toastMessage}
  </div>
{/if}

<!-- Filters -->
{#if !exportMode && ($categories.length > 0 || $templates.length > 0)}
  <div class="filters" in:fade={{ duration: 150 }}>
    <div class="pills">
      <button
        class="pill"
        class:active={!filterCat && !showFavsOnly}
        on:click={clearFilters}
      >
        Alle
      </button>

      {#each $categories as cat}
        <button
          class="pill"
          class:active={filterCat === cat}
          on:click={() => setFilter(cat)}
        >
          {cat}
        </button>
      {/each}

      <button
        class="pill fav-pill"
        class:active={showFavsOnly}
        on:click={() => setFavs(!showFavsOnly)}
        title="Nur Favoriten"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill={showFavsOnly ? "currentColor" : "none"} stroke="currentColor" stroke-width="2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      </button>
    </div>

    {#if $templates.length > 3}
      <div class="search-wrap">
        <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          class="search"
          bind:value={search}
          placeholder="Suchen…"
        />
      </div>
    {/if}
  </div>
{/if}

<!-- List -->
{#if filtered.length === 0}
  <div class="empty" in:fade={{ duration: 200 }}>
    <div class="empty-icon">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
    </div>
    <p>
      {#if $templates.length === 0}
        Noch keine Templates. Erstelle dein erstes!
      {:else}
        Kein Treffer.
      {/if}
    </p>
  </div>
{:else}
  <div class="list">
    {#each filtered as t, idx (t.id + '-' + filterGeneration)}
      <div
        class="card"
        class:card-selected={exportMode && selected.has(t.id)}
        in:fly={{ y: 12, duration: 200, delay: idx * 30, easing: cubicOut }}
        out:fade={{ duration: 0 }}
        on:click={() => handleCardClick(t)}
        on:keydown={(e) => e.key === "Enter" && handleCardClick(t)}
        role="button"
        tabindex="0"
      >
        <!-- Export checkbox -->
        {#if exportMode}
          <div class="card-checkbox" transition:scale={{ duration: 120 }}>
            <div class="checkbox-card" class:checked={selected.has(t.id)}>
              {#if selected.has(t.id)}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" in:scale={{ duration: 120 }}>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              {/if}
            </div>
          </div>
        {/if}

        <div class="card-body">
          <div class="card-title-row">
            <span class="card-name">{t.name}</span>
            {#if t.favorite}
              <span class="star" in:scale={{ duration: 200 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </span>
            {/if}
          </div>

          <div class="card-tags">
            {#each t.category as cat}
              <span class="tag cat">{cat}</span>
            {/each}
            {#each t.placeholders as p}
              <span class="tag">{`{{${p}}}`}</span>
            {/each}
            {#if t.eitherOrs && t.eitherOrs.length > 0}
              <span class="tag opt">
                +{t.eitherOrs.length} Entweder/Oder
              </span>
            {/if}
            {#if t.optionals.length > 0}
              <span class="tag opt">
                +{t.optionals.length} Option{t.optionals.length > 1 ? "en" : ""}
              </span>
            {/if}
          </div>
        </div>

        {#if !exportMode}
          <div class="card-actions">
            <button
              class="icon-btn"
              class:active={t.favorite}
              on:click={(e) => handleFav(e, t.id)}
              title={t.favorite ? "Favorit entfernen" : "Favorit"}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill={t.favorite ? "currentColor" : "none"} stroke="currentColor" stroke-width="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </button>
            <button
              class="icon-btn"
              on:click={(e) => handleEdit(e, t)}
              title="Bearbeiten"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
            <button
              class="icon-btn danger"
              on:click={(e) => handleDelete(e, t.id)}
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
        {/if}
      </div>
    {/each}
  </div>
{/if}

<!-- Footer hint -->
<div class="footer-hint">
  <kbd>Strg</kbd> + <kbd>1</kbd> zum Ein-/Ausblenden
</div>

<style>
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 32px;
  }

  h1 {
    font-size: 24px;
    font-weight: 700;
    color: var(--text);
    letter-spacing: -0.03em;
  }

  .subtitle {
    font-size: 13px;
    color: var(--text-muted);
    margin-top: 3px;
    font-weight: 400;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .btn-icon-label {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: var(--radius);
    color: var(--text-muted);
    background: var(--bg-card);
    border: 1.5px solid var(--border-light);
    transition: all var(--transition);
  }

  .btn-icon-label:hover {
    background: var(--bg-hover);
    border-color: var(--border);
    color: var(--text);
    transform: translateY(-1px);
  }

  /* ── Export Bar ── */
  .export-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 16px;
    margin-bottom: 20px;
    background: var(--accent-bg);
    border: 1.5px solid var(--accent-border);
    border-radius: var(--radius-lg);
  }

  .export-bar-left {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .export-bar-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .select-all-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 500;
    color: var(--text);
    padding: 4px 0;
    transition: color var(--transition);
  }

  .select-all-btn:hover {
    color: var(--accent);
  }

  .export-count {
    font-size: 12px;
    color: var(--text-muted);
    font-weight: 500;
  }

  .checkbox-mini {
    width: 18px;
    height: 18px;
    border-radius: 5px;
    border: 2px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all var(--transition);
    background: var(--bg);
    flex-shrink: 0;
  }

  .checkbox-mini.checked {
    background: var(--accent);
    border-color: var(--accent);
  }

  /* ── Import Toast ── */
  .toast {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    margin-bottom: 16px;
    background: var(--bg-card);
    border: 1.5px solid var(--accent-border);
    border-radius: var(--radius);
    font-size: 13px;
    font-weight: 500;
    color: var(--accent);
  }

  /* ── Filters ── */
  .filters {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-bottom: 24px;
  }

  .pills {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    align-items: center;
  }

  .pill {
    padding: 6px 16px;
    font-size: 12.5px;
    font-weight: 500;
    color: var(--text-secondary);
    background: var(--bg-card);
    border: 1.5px solid var(--border);
    border-radius: 20px;
    transition: all var(--transition);
    white-space: nowrap;
  }

  .pill:hover {
    background: var(--bg-hover);
    border-color: var(--text-muted);
    transform: translateY(-1px);
  }

  .pill.active {
    background: var(--accent);
    color: #fff;
    border-color: var(--accent);
    box-shadow: 0 2px 8px rgba(99, 102, 241, 0.25);
  }

  .fav-pill {
    margin-left: auto;
    padding: 6px 12px;
    display: flex;
    align-items: center;
  }

  .fav-pill.active {
    background: #fffbeb;
    color: var(--favorite);
    border-color: #fcd34d;
    box-shadow: 0 2px 8px rgba(245, 158, 11, 0.15);
  }

  :global([data-theme="dark"]) .fav-pill.active {
    background: #2a2410;
    border-color: #6b5a1e;
  }

  .search-wrap {
    position: relative;
  }

  .search-icon {
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-muted);
    pointer-events: none;
  }

  .search {
    font-size: 13px;
    padding: 9px 12px 9px 36px;
  }

  /* ── Empty ── */
  .empty {
    text-align: center;
    padding: 64px 0;
    color: var(--text-muted);
  }

  .empty-icon {
    margin-bottom: 16px;
    opacity: 0.35;
  }

  .empty p {
    font-size: 14px;
    font-weight: 400;
  }

  /* ── Card List ── */
  .list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .card {
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--bg-card);
    border: 1.5px solid var(--border-light);
    border-radius: var(--radius-lg);
    padding: 16px 18px;
    cursor: pointer;
    transition: background var(--transition), border-color var(--transition), box-shadow var(--transition);
  }

  .card:hover {
    background: var(--bg-hover);
    border-color: var(--border);
    box-shadow: var(--shadow-sm);
  }

  .card:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .card-selected {
    background: var(--accent-bg);
    border-color: var(--accent-border);
  }

  .card-selected:hover {
    background: var(--accent-bg);
    border-color: var(--accent);
  }

  /* ── Card Checkbox ── */
  .card-checkbox {
    flex-shrink: 0;
  }

  .checkbox-card {
    width: 22px;
    height: 22px;
    border-radius: 6px;
    border: 2px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all var(--transition);
    background: var(--bg);
  }

  .checkbox-card.checked {
    background: var(--accent);
    border-color: var(--accent);
    box-shadow: 0 2px 6px rgba(99, 102, 241, 0.3);
  }

  .card-body {
    flex: 1;
    min-width: 0;
  }

  .card-title-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .card-name {
    font-weight: 600;
    font-size: 14.5px;
    color: var(--text);
  }

  .star {
    color: var(--favorite);
    display: flex;
    align-items: center;
  }

  .card-tags {
    display: flex;
    gap: 5px;
    flex-wrap: wrap;
  }

  .card-actions {
    display: flex;
    gap: 2px;
    flex-shrink: 0;
    opacity: 0;
    transition: opacity var(--transition);
  }

  .card:hover .card-actions {
    opacity: 1;
  }

  /* ── Footer Hint ── */
  .footer-hint {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 24px 0 4px;
    font-size: 11.5px;
    color: var(--text-muted);
    opacity: 0.5;
    user-select: none;
    transition: opacity var(--transition);
  }

  .footer-hint:hover {
    opacity: 0.8;
  }

  .footer-hint :global(kbd) {
    display: inline-flex;
    align-items: center;
    padding: 2px 6px;
    font-family: inherit;
    font-size: 10.5px;
    font-weight: 600;
    color: var(--text-muted);
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 5px;
    box-shadow: 0 1px 0 var(--border);
    line-height: 1.3;
  }
</style>
