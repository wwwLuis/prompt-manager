<script lang="ts">
  import { fade, fly, scale } from "svelte/transition";
  import { type Template, snippetMap, applySnippets, promptHistory, extractOptionalBlocks } from "./store";

  export let template: Template;
  export let onBack: () => void;
  export let onEdit: (() => void) | undefined = undefined;

  let values: Record<string, string> = {};
  let checked: Record<number, boolean> = {};
  let eoSelected: Record<number, number> = {};  // group index → selected option index
  let copied = false;

  // List inputs: placeholder → string[]
  let listValues: Record<string, string[]> = {};
  let listInputs: Record<string, string> = {}; // current input text per list placeholder

  // Choicelist: placeholder → selected option string
  let choicelistSelected: Record<string, string> = {};

  // Optional vars: enabled state (default true = included)
  $: optionalVarSet = new Set(template.optionalVars ?? []);
  let optVarEnabled: Record<string, boolean> = {};
  // Initialize: all optional vars start enabled
  $: {
    for (const p of template.optionalVars ?? []) {
      if (optVarEnabled[p] === undefined) {
        optVarEnabled[p] = true;
      }
    }
  }

  $: listSet = new Set(template.lists ?? []);
  $: choicelistMap = template.choicelists ?? {};
  $: choicelistKeys = new Set(Object.keys(choicelistMap));

  // Standalone blocks: {{#name}}...{{/name}} where name is NOT a placeholder
  $: allBlockNames = extractOptionalBlocks(template.body);
  $: standaloneBlocks = allBlockNames.filter((b) => !template.placeholders.includes(b));
  let blockEnabled: Record<string, boolean> = {};
  $: {
    for (const b of standaloneBlocks) {
      if (blockEnabled[b] === undefined) blockEnabled[b] = true;
    }
  }
  function toggleBlock(b: string) {
    blockEnabled = { ...blockEnabled, [b]: !blockEnabled[b] };
  }

  function toggleOptVarEnabled(p: string) {
    optVarEnabled = { ...optVarEnabled, [p]: !optVarEnabled[p] };
  }

  function addListItem(p: string) {
    const text = (listInputs[p] || "").trim();
    if (!text) return;
    const items = listValues[p] || [];
    listValues = { ...listValues, [p]: [...items, text] };
    listInputs = { ...listInputs, [p]: "" };
  }

  function removeListItem(p: string, i: number) {
    const items = listValues[p] || [];
    listValues = { ...listValues, [p]: items.filter((_, idx) => idx !== i) };
  }

  function handleListKeydown(e: KeyboardEvent, p: string) {
    if (e.key === "Enter") {
      e.preventDefault();
      addListItem(p);
    }
  }

  function setListInput(p: string, val: string) {
    listInputs = { ...listInputs, [p]: val };
  }

  function selectChoicelist(p: string, option: string) {
    choicelistSelected = { ...choicelistSelected, [p]: option };
  }

  function setVal(key: string, val: string) {
    values = { ...values, [key]: val };
  }

  function toggleOpt(i: number) {
    checked = { ...checked, [i]: !checked[i] };
  }

  function selectEo(groupIdx: number, optIdx: number) {
    eoSelected = { ...eoSelected, [groupIdx]: optIdx };
  }

  $: prompt = buildPrompt(template, values, checked, eoSelected, $snippetMap, optVarEnabled, listValues, choicelistSelected, blockEnabled);

  function buildPrompt(
    tpl: Template,
    vals: Record<string, string>,
    chk: Record<number, boolean>,
    eoSel: Record<number, number>,
    snipMap: Map<string, string>,
    ovEnabled: Record<string, boolean>,
    listVals: Record<string, string[]>,
    choiceSel: Record<string, string>,
    blkEnabled: Record<string, boolean>
  ): string {
    let result = tpl.body;

    // 1. Handle all blocks: {{#name}}...{{/name}}
    const optSet = new Set(tpl.optionalVars ?? []);
    const allBlocks = extractOptionalBlocks(tpl.body);

    // Collect all disabled block names (from optional vars + standalone blocks)
    const disabledBlocks = new Set<string>();
    for (const b of allBlocks) {
      const isPlaceholder = tpl.placeholders.includes(b);
      if (isPlaceholder && optSet.has(b) && !ovEnabled[b]) {
        disabledBlocks.add(b);
      } else if (!isPlaceholder && blkEnabled[b] === false) {
        disabledBlocks.add(b);
      }
    }

    // Remove disabled blocks entirely
    for (const b of disabledBlocks) {
      const blockRe = new RegExp(`\\{\\{#${b}\\}\\}[\\s\\S]*?\\{\\{/${b}\\}\\}`, "g");
      result = result.replace(blockRe, "");
    }
    // For enabled blocks, strip markers but keep content
    for (const b of allBlocks) {
      if (!disabledBlocks.has(b)) {
        result = result.replaceAll(`{{#${b}}}`, "");
        result = result.replaceAll(`{{/${b}}}`, "");
      }
    }

    // Also remove lines with disabled optional placeholder vars that aren't inside blocks
    const disabledOptionals = new Set<string>();
    for (const p of tpl.placeholders) {
      if (optSet.has(p) && !ovEnabled[p]) {
        disabledOptionals.add(p);
      }
    }
    if (disabledOptionals.size > 0) {
      const lines = result.split("\n");
      const filtered = lines.filter((line) => {
        for (const p of disabledOptionals) {
          if (line.includes(`{{${p}}}`)) return false;
        }
        return true;
      });
      result = filtered.join("\n");
    }

    // 2. Replace snippets [[key]] → snippet value
    result = applySnippets(result, snipMap);

    // 3. Replace placeholders {{name}} → user input (or list/choicelist values)
    const listSetLocal = new Set(tpl.lists ?? []);
    const choicelistMapLocal = tpl.choicelists ?? {};
    for (const p of tpl.placeholders) {
      if (disabledOptionals.has(p)) continue; // already removed
      if (listSetLocal.has(p)) {
        const items = listVals[p] || [];
        const formatted = items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : `{{${p}}}`;
        result = result.replaceAll(`{{${p}}}`, formatted);
      } else if (p in choicelistMapLocal) {
        const selectedOpt = choiceSel[p] || "";
        let resolvedValue = `{{${p}}}`;
        if (selectedOpt) {
          // If it's a snippet reference [[key]], resolve it
          const snippetMatch = selectedOpt.match(/^\[\[(\w+)\]\]$/);
          if (snippetMatch) {
            resolvedValue = snipMap.get(snippetMatch[1]) ?? selectedOpt;
          } else {
            resolvedValue = selectedOpt;
          }
        }
        result = result.replaceAll(`{{${p}}}`, resolvedValue);
      } else {
        result = result.replaceAll(`{{${p}}}`, vals[p] || `{{${p}}}`);
      }
    }

    // 4. Clean up multiple empty lines
    result = result.replace(/\n{3,}/g, "\n\n");

    // 5. Append selected optionals
    const active = tpl.optionals.filter((_, i) => chk[i]);
    if (active.length > 0) {
      result += "\n\n" + active.join("\n");
    }

    // 6. Append selected either/or options
    const eoGroups = tpl.eitherOrs ?? [];
    const eoActive = eoGroups
      .map((group, gi) => group[eoSel[gi] ?? 0])
      .filter(Boolean);
    if (eoActive.length > 0) {
      result += "\n\n" + eoActive.join("\n");
    }
    return result.trim();
  }

  $: allFilled = template.placeholders.every(
    (p) => values[p] && values[p].trim().length > 0
  );

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(prompt);
      promptHistory.add(template.name, prompt);
      copied = true;
      setTimeout(() => (copied = false), 1800);
    } catch {}
  }

  $: textareaSet = new Set(template.textareas ?? []);
</script>

<div class="builder">
  <!-- Header -->
  <div class="header">
    <button class="back-btn" on:click={onBack} title="Zurück">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <line x1="19" y1="12" x2="5" y2="12" />
        <polyline points="12 19 5 12 12 5" />
      </svg>
    </button>
    <div class="header-info">
      <h2>{template.name}</h2>
      {#each template.category as cat}
        <span class="tag cat">{cat}</span>
      {/each}
    </div>
    {#if onEdit}
      <button class="edit-btn" on:click={onEdit} title="Template bearbeiten">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      </button>
    {/if}
  </div>

  <!-- Placeholder inputs -->
  {#if template.placeholders.length > 0}
    <div class="fields">
      {#each template.placeholders as p, i}
        <div class="field" class:field-disabled={optionalVarSet.has(p) && !optVarEnabled[p]} in:fly={{ y: 8, duration: 150, delay: i * 40 }}>
          <div class="label-row">
            <label class="label" for="ph-{p}">{p}</label>
            {#if optionalVarSet.has(p)}
              <button
                class="opt-pill"
                class:opt-pill-off={!optVarEnabled[p]}
                on:click={() => toggleOptVarEnabled(p)}
                title={optVarEnabled[p] !== false ? "Abschnitt deaktivieren" : "Abschnitt aktivieren"}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
                  {#if optVarEnabled[p] !== false}
                    <polyline points="20 6 9 17 4 12" />
                  {:else}
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  {/if}
                </svg>
                {optVarEnabled[p] !== false ? "an" : "aus"}
              </button>
            {/if}
          </div>
          {#if !optionalVarSet.has(p) || optVarEnabled[p] !== false}
            {#if listSet.has(p)}
              <!-- List input -->
              <div class="list-input-wrap">
                {#if (listValues[p] || []).length > 0}
                  <div class="list-items">
                    {#each listValues[p] || [] as item, li}
                      <div class="list-item" in:fly={{ x: -8, duration: 120 }}>
                        <span class="list-bullet">-</span>
                        <span class="list-item-text">{item}</span>
                        <button class="list-item-remove" on:click={() => removeListItem(p, li)} title="Entfernen">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    {/each}
                  </div>
                {/if}
                <div class="list-add-row">
                  <input
                    id="ph-{p}"
                    value={listInputs[p] || ""}
                    on:input={(e) => setListInput(p, e.currentTarget.value)}
                    on:keydown={(e) => handleListKeydown(e, p)}
                    placeholder="Eintrag hinzufügen… (Enter)"
                  />
                  <button class="list-add-btn" on:click={() => addListItem(p)} title="Hinzufügen">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </button>
                </div>
              </div>
            {:else if choicelistKeys.has(p)}
              <!-- Choicelist (dropdown) -->
              {#if (choicelistMap[p] || []).length > 0}
                <select
                  id="ph-{p}"
                  class="choicelist-dropdown-select"
                  value={choicelistSelected[p] || ""}
                  on:change={(e) => selectChoicelist(p, e.currentTarget.value)}
                >
                  <option value="" disabled>— Option wählen —</option>
                  {#each choicelistMap[p] as opt}
                    <option value={opt}>{opt.startsWith("[[") && opt.endsWith("]]") ? opt.slice(2, -2) + " (Snippet)" : opt}</option>
                  {/each}
                </select>
              {:else}
                <span class="choicelist-no-options">Keine Optionen definiert — bearbeite das Template um Optionen hinzuzufügen.</span>
              {/if}
            {:else if textareaSet.has(p)}
              <textarea
                id="ph-{p}"
                value={values[p] || ""}
                on:input={(e) => setVal(p, e.currentTarget.value)}
                placeholder="{p} hier einfügen…"
                rows="5"
                class="mono"
              ></textarea>
            {:else}
              <input
                id="ph-{p}"
                value={values[p] || ""}
                on:input={(e) => setVal(p, e.currentTarget.value)}
                placeholder="{p} eingeben…"
              />
            {/if}
          {:else}
            <div class="field-disabled-hint">Abschnitt deaktiviert - wird nicht im Prompt erscheinen</div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <!-- Standalone block toggles -->
  {#if standaloneBlocks.length > 0}
    <div class="fields standalone-blocks">
      <span class="label">Abschnitte</span>
      {#each standaloneBlocks as b, i}
        <div class="field standalone-block-field" class:field-disabled={blockEnabled[b] === false} in:fly={{ y: 8, duration: 150, delay: i * 40 }}>
          <div class="label-row">
            <label class="label">{b}</label>
            <button
              class="opt-pill"
              class:opt-pill-off={blockEnabled[b] === false}
              on:click={() => toggleBlock(b)}
              title={blockEnabled[b] !== false ? "Abschnitt deaktivieren" : "Abschnitt aktivieren"}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
                {#if blockEnabled[b] !== false}
                  <polyline points="20 6 9 17 4 12" />
                {:else}
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                {/if}
              </svg>
              {blockEnabled[b] !== false ? "an" : "aus"}
            </button>
          </div>
          {#if blockEnabled[b] === false}
            <div class="field-disabled-hint">Abschnitt deaktiviert</div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <!-- Optionals -->
  {#if template.optionals.length > 0}
    <div class="optionals">
      <span class="label">Optionen</span>
      <div class="opt-list">
        {#each template.optionals as o, i}
          <label
            class="opt-item"
            class:active={checked[i]}
            in:fly={{ y: 6, duration: 150, delay: i * 30 }}
          >
            <div class="checkbox" class:checked={checked[i]}>
              {#if checked[i]}
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#fff"
                  stroke-width="3"
                  stroke-linecap="round"
                  in:scale={{ duration: 150 }}
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              {/if}
            </div>
            <span class="opt-label">{o}</span>
            <input
              type="checkbox"
              checked={!!checked[i]}
              on:change={() => toggleOpt(i)}
              class="sr-only"
            />
          </label>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Either/Or -->
  {#if (template.eitherOrs ?? []).length > 0}
    <div class="optionals">
      <span class="label">Entweder / Oder</span>
      <div class="eo-list">
        {#each template.eitherOrs as group, gi}
          <div class="eo-group" in:fly={{ y: 6, duration: 150, delay: gi * 30 }}>
            {#each group as opt, oi}
              <label
                class="opt-item"
                class:active={( eoSelected[gi] ?? 0 ) === oi}
              >
                <div class="radio" class:checked={( eoSelected[gi] ?? 0 ) === oi}>
                  {#if ( eoSelected[gi] ?? 0 ) === oi}
                    <div class="radio-dot" in:scale={{ duration: 150 }}></div>
                  {/if}
                </div>
                <span class="opt-label">{opt}</span>
                <input
                  type="radio"
                  name="eo-{gi}"
                  checked={( eoSelected[gi] ?? 0 ) === oi}
                  on:change={() => selectEo(gi, oi)}
                  class="sr-only"
                />
              </label>
            {/each}
            {#if gi < template.eitherOrs.length - 1}
              <div class="eo-divider"></div>
            {/if}
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Preview -->
  <div class="preview-section">
    <span class="label">Vorschau</span>
    <pre class="preview">{prompt}</pre>
  </div>

  <!-- Copy button -->
  <button class="btn-primary copy-btn" on:click={handleCopy}>
    {#if copied}
      <span class="copy-content" in:scale={{ duration: 150 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        Kopiert!
      </span>
    {:else}
      <span class="copy-content">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
        Prompt kopieren
      </span>
    {/if}
  </button>
</div>

<style>
  .builder {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .header {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 4px;
  }

  .header-info {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  h2 {
    font-size: 19px;
    font-weight: 600;
    color: var(--text);
    letter-spacing: -0.02em;
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

  .edit-btn {
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
    margin-left: auto;
  }

  .edit-btn:hover {
    background: var(--bg-hover);
    color: var(--accent);
    border-color: var(--border);
  }

  .fields {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .field {
    display: flex;
    flex-direction: column;
  }

  .mono {
    font-family: "SF Mono", "Cascadia Code", "Consolas", monospace;
    font-size: 13px;
  }

  .optionals {
    display: flex;
    flex-direction: column;
  }

  .opt-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .opt-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border-radius: var(--radius);
    background: var(--bg-card);
    border: 1.5px solid var(--border-light);
    cursor: pointer;
    transition: all var(--transition);
    user-select: none;
  }

  .opt-item:hover {
    background: var(--bg-hover);
    border-color: var(--border);
  }

  .opt-item.active {
    background: var(--accent-bg);
    border-color: var(--accent-border);
  }

  .checkbox {
    width: 20px;
    height: 20px;
    border-radius: 6px;
    border: 2px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all var(--transition);
    flex-shrink: 0;
    background: var(--bg);
  }

  .checkbox.checked {
    background: var(--accent);
    border-color: var(--accent);
    box-shadow: 0 2px 6px rgba(99, 102, 241, 0.3);
  }

  .opt-label {
    font-size: 13.5px;
    color: var(--text);
    line-height: 1.3;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
  }

  .preview-section {
    display: flex;
    flex-direction: column;
  }

  .preview {
    background: var(--bg-card);
    border: 1.5px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 18px;
    font-size: 12.5px;
    font-family: "SF Mono", "Cascadia Code", "Consolas", monospace;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--text);
    max-height: 240px;
    overflow: auto;
    line-height: 1.65;
    margin: 0;
  }

  .copy-btn {
    width: 100%;
    padding: 14px;
    margin-top: 2px;
    font-size: 14px;
  }

  .copy-content {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  /* ── Either/Or ── */
  .eo-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .eo-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .eo-divider {
    height: 1px;
    background: var(--border-light);
    margin: 4px 0;
  }

  .radio {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 2px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all var(--transition);
    flex-shrink: 0;
    background: var(--bg);
  }

  .radio.checked {
    border-color: var(--accent);
    box-shadow: 0 2px 6px rgba(99, 102, 241, 0.3);
  }

  .radio-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--accent);
  }

  /* ── Optional Variable Pill ── */
  .label-row {
    display: flex;
    align-items: baseline;
    gap: 6px;
    margin-bottom: 6px;
  }

  .label-row > .label {
    margin-bottom: 0;
  }

  .opt-pill {
    display: inline-flex;
    align-items: baseline;
    gap: 3px;
    padding: 0;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    border: none;
    background: none;
    color: var(--accent);
    cursor: pointer;
    transition: color var(--transition);
    flex-shrink: 0;
  }

  .opt-pill:hover {
    color: var(--accent-hover, #4338ca);
  }

  .opt-pill-off {
    color: var(--text-muted);
  }

  .opt-pill-off:hover {
    color: var(--text-secondary);
  }

  .field-disabled {
    opacity: 0.45;
  }

  .field-disabled-hint {
    font-size: 12px;
    color: var(--text-muted);
    font-style: italic;
    padding: 6px 0;
  }

  /* ── Choicelist Dropdown ── */
  .choicelist-dropdown-select {
    width: 100%;
    padding: 10px 14px;
    font-size: 13.5px;
    color: var(--text);
    background: var(--bg-card);
    border: 1.5px solid var(--border-light);
    border-radius: var(--radius);
    transition: all var(--transition);
    cursor: pointer;
    appearance: auto;
  }

  .choicelist-dropdown-select:hover {
    border-color: var(--border);
  }

  .choicelist-dropdown-select:focus {
    border-color: var(--accent);
    outline: none;
    box-shadow: 0 0 0 3px var(--accent-bg);
  }

  .choicelist-no-options {
    font-size: 12px;
    color: var(--text-muted);
    font-style: italic;
    padding: 8px 0;
  }

  /* ── List Input ── */
  .list-input-wrap {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .list-items {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .list-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--bg-card);
    border: 1px solid var(--border-light);
    border-radius: var(--radius);
    transition: all var(--transition);
  }

  .list-item:hover {
    border-color: var(--border);
  }

  .list-bullet {
    font-weight: 700;
    color: var(--accent);
    flex-shrink: 0;
    font-size: 14px;
  }

  .list-item-text {
    flex: 1;
    font-size: 13.5px;
    color: var(--text);
  }

  .list-item-remove {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 6px;
    color: var(--text-muted);
    opacity: 0;
    transition: all var(--transition);
    flex-shrink: 0;
  }

  .list-item:hover .list-item-remove {
    opacity: 1;
  }

  .list-item-remove:hover {
    color: var(--danger, #ef4444);
    background: var(--danger-bg, #fef2f2);
  }

  .list-add-row {
    display: flex;
    gap: 8px;
  }

  .list-add-row input {
    flex: 1;
  }

  .list-add-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 42px;
    flex-shrink: 0;
    background: var(--bg-card);
    border: 1.5px solid var(--border-light);
    border-radius: var(--radius);
    color: var(--text-secondary);
    transition: all var(--transition);
  }

  .list-add-btn:hover {
    background: var(--accent-bg);
    border-color: var(--accent-border);
    color: var(--accent);
  }

</style>
