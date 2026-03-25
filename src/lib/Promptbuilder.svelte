<script lang="ts">
  import { fade, fly, scale } from "svelte/transition";
  import { type Template, snippetMap, applySnippets, promptHistory } from "./store";

  export let template: Template;
  export let onBack: () => void;
  export let onEdit: (() => void) | undefined = undefined;

  let values: Record<string, string> = {};
  let checked: Record<number, boolean> = {};
  let eoSelected: Record<number, number> = {};  // group index → selected option index
  let copied = false;

  function setVal(key: string, val: string) {
    values = { ...values, [key]: val };
  }

  function toggleOpt(i: number) {
    checked = { ...checked, [i]: !checked[i] };
  }

  function selectEo(groupIdx: number, optIdx: number) {
    eoSelected = { ...eoSelected, [groupIdx]: optIdx };
  }

  $: prompt = buildPrompt(template, values, checked, eoSelected, $snippetMap);

  function buildPrompt(
    tpl: Template,
    vals: Record<string, string>,
    chk: Record<number, boolean>,
    eoSel: Record<number, number>,
    snipMap: Map<string, string>
  ): string {
    let result = tpl.body;
    // 1. Replace snippets [[key]] → snippet value
    result = applySnippets(result, snipMap);
    // 2. Replace placeholders {{name}} → user input
    for (const p of tpl.placeholders) {
      result = result.replaceAll(`{{${p}}}`, vals[p] || `{{${p}}}`);
    }
    // 3. Append selected optionals
    const active = tpl.optionals.filter((_, i) => chk[i]);
    if (active.length > 0) {
      result += "\n\n" + active.join("\n");
    }
    // 4. Append selected either/or options
    const eoGroups = tpl.eitherOrs ?? [];
    const eoActive = eoGroups
      .map((group, gi) => group[eoSel[gi] ?? 0])
      .filter(Boolean);
    if (eoActive.length > 0) {
      result += "\n\n" + eoActive.join("\n");
    }
    return result;
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
        <div class="field" in:fly={{ y: 8, duration: 150, delay: i * 40 }}>
          <label class="label" for="ph-{p}">{p}</label>
          {#if textareaSet.has(p)}
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
</style>
