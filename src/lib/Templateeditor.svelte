<script lang="ts">
  import { fly, fade, slide } from "svelte/transition";
  import {
    templates,
    categories,
    snippets,
    genId,
    extractPlaceholders,
    extractSnippetRefs,
    type Template,
  } from "./store";

  export let template: Template | null;
  export let onSave: () => void;
  export let onCancel: () => void;

  let name = template?.name || "";
  let body = template?.body || "";
  let categoryList: string[] = template?.category ? [...template.category] : [];
  let newCatInput = "";
  let optionals: string[] = template?.optionals ? [...template.optionals] : [];
  let eitherOrs: string[][] = template?.eitherOrs
    ? template.eitherOrs.map((g) => [...g])
    : [];
  let textareas: Set<string> = new Set(template?.textareas ?? []);
  let lists: Set<string> = new Set(template?.lists ?? []);
  let optionalVars: Set<string> = new Set(template?.optionalVars ?? []);
  let choicelists: Record<string, string[]> = template?.choicelists ? { ...template.choicelists } : {};
  let newOpt = "";
  let newEoOptions: string[] = ["", ""];  // current either/or group being built
  let showCatSuggestions = false;
  // Track which placeholder has its choicelist snippet picker open
  let choicelistOpenFor: string | null = null;

  // ── Autocomplete (snippets + block markers) ──
  let bodyEl: HTMLTextAreaElement;
  let acVisible = false;
  let acQuery = "";
  let acIndex = 0;
  let acStart = -1; // cursor position where trigger starts
  let acTop = 0;
  let acLeft = 0;
  let acMode: "snippet" | "block-open" | "block-close" = "snippet";

  // Autocomplete items depend on mode
  $: acItems = (() => {
    if (acMode === "snippet") {
      const filtered = acQuery
        ? $snippets.filter((s) => s.key.toLowerCase().startsWith(acQuery.toLowerCase()))
        : $snippets;
      return filtered.map((s) => ({ key: s.key, desc: s.description }));
    } else {
      // block-open or block-close: suggest existing placeholder names
      const filtered = acQuery
        ? placeholders.filter((p) => p.toLowerCase().startsWith(acQuery.toLowerCase()))
        : placeholders;
      return filtered.map((p) => ({ key: p, desc: acMode === "block-open" ? "Block öffnen" : "Block schließen" }));
    }
  })();

  function handleBodyInput() {
    if (!bodyEl) return;
    const pos = bodyEl.selectionStart;
    const text = bodyEl.value;
    const before = text.slice(0, pos);

    // Check for {{# (block open)
    const blockOpenIdx = before.lastIndexOf("{{#");
    const blockOpenClose = before.lastIndexOf("}}", blockOpenIdx > 0 ? blockOpenIdx : 0);
    if (blockOpenIdx >= 0 && blockOpenIdx > blockOpenClose) {
      const partial = before.slice(blockOpenIdx + 3);
      if (/^\w*$/.test(partial) && placeholders.length > 0) {
        acQuery = partial;
        acStart = blockOpenIdx;
        acMode = "block-open";
        acIndex = 0;
        acVisible = true;
        positionDropdown();
        return;
      }
    }

    // Check for {{/ (block close)
    const blockCloseIdx = before.lastIndexOf("{{/");
    const blockCloseClose = before.lastIndexOf("}}", blockCloseIdx > 0 ? blockCloseIdx : 0);
    if (blockCloseIdx >= 0 && blockCloseIdx > blockCloseClose) {
      const partial = before.slice(blockCloseIdx + 3);
      if (/^\w*$/.test(partial) && placeholders.length > 0) {
        acQuery = partial;
        acStart = blockCloseIdx;
        acMode = "block-close";
        acIndex = 0;
        acVisible = true;
        positionDropdown();
        return;
      }
    }

    // Check for [[ (snippet)
    const openIdx = before.lastIndexOf("[[");
    const closeIdx = before.lastIndexOf("]]");
    if (openIdx >= 0 && openIdx > closeIdx) {
      const partial = before.slice(openIdx + 2);
      if (/^\w*$/.test(partial) && $snippets.length > 0) {
        acQuery = partial;
        acStart = openIdx;
        acMode = "snippet";
        acIndex = 0;
        acVisible = true;
        positionDropdown();
        return;
      }
    }

    acVisible = false;
  }

  function positionDropdown() {
    if (!bodyEl) return;
    // Use a mirror div to measure caret position
    const rect = bodyEl.getBoundingClientRect();
    const style = getComputedStyle(bodyEl);
    const lineHeight = parseFloat(style.lineHeight) || 20;
    const paddingTop = parseFloat(style.paddingTop) || 0;
    const paddingLeft = parseFloat(style.paddingLeft) || 0;

    // Approximate: count newlines before cursor for vertical offset
    const textBefore = bodyEl.value.slice(0, bodyEl.selectionStart);
    const lines = textBefore.split("\n");
    const lineNum = lines.length - 1;
    const lastLine = lines[lines.length - 1];

    // Approximate char width using monospace assumption
    const charWidth = 7.8; // ~13px monospace font

    acTop = paddingTop + (lineNum + 1) * lineHeight - bodyEl.scrollTop;
    acLeft = paddingLeft + lastLine.length * charWidth;

    // Clamp to not go off-screen
    const maxLeft = bodyEl.offsetWidth - 220;
    if (acLeft > maxLeft) acLeft = maxLeft;
    if (acLeft < 0) acLeft = 0;
  }

  function insertAutocomplete(key: string) {
    if (!bodyEl || acStart < 0) return;
    const before = body.slice(0, acStart);
    const after = body.slice(bodyEl.selectionStart);

    let insertion: string;
    if (acMode === "snippet") {
      insertion = `[[${key}]]`;
    } else if (acMode === "block-open") {
      insertion = `{{#${key}}}`;
    } else {
      insertion = `{{/${key}}}`;
    }

    body = before + insertion + after;
    acVisible = false;

    requestAnimationFrame(() => {
      if (!bodyEl) return;
      const newPos = acStart + insertion.length;
      bodyEl.focus();
      bodyEl.setSelectionRange(newPos, newPos);
    });
  }

  function handleBodyKeydown(e: KeyboardEvent) {
    if (!acVisible || acItems.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      acIndex = (acIndex + 1) % acItems.length;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      acIndex = (acIndex - 1 + acItems.length) % acItems.length;
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      insertAutocomplete(acItems[acIndex].key);
    } else if (e.key === "Escape") {
      e.preventDefault();
      acVisible = false;
    }
  }

  function handleBodyBlur() {
    // Small delay so click on dropdown item can fire first
    setTimeout(() => (acVisible = false), 150);
  }

  $: placeholders = extractPlaceholders(body);
  $: snippetRefs = extractSnippetRefs(body);
  $: availableSnippetKeys = $snippets.map((s) => s.key);
  $: canSave = name.trim().length > 0 && body.trim().length > 0;

  type PlaceholderType = "input" | "textarea" | "list" | "choicelist";

  // Reactive map of placeholder → type (must be a reactive statement, not just a function,
  // so that Svelte re-renders when choicelists/lists/textareas change)
  $: placeholderTypes = (() => {
    const map: Record<string, PlaceholderType> = {};
    for (const p of placeholders) {
      if (p in choicelists) map[p] = "choicelist";
      else if (lists.has(p)) map[p] = "list";
      else if (textareas.has(p)) map[p] = "textarea";
      else map[p] = "input";
    }
    return map;
  })();

  function getPlaceholderType(p: string): PlaceholderType {
    return placeholderTypes[p] ?? "input";
  }

  function setPlaceholderType(p: string, type: PlaceholderType) {
    // Save existing choicelist options before clearing
    const savedOptions = choicelists[p] ?? [];

    // Clear from all sets first
    textareas.delete(p);
    lists.delete(p);
    const { [p]: _, ...restChoicelists } = choicelists;
    choicelists = restChoicelists;

    // Set the new type
    if (type === "textarea") textareas.add(p);
    else if (type === "list") lists.add(p);
    else if (type === "choicelist") choicelists = { ...choicelists, [p]: savedOptions };

    // Trigger reactivity
    textareas = new Set(textareas);
    lists = new Set(lists);
  }

  function toggleOptionalVar(p: string) {
    if (optionalVars.has(p)) {
      optionalVars.delete(p);
    } else {
      optionalVars.add(p);
    }
    optionalVars = new Set(optionalVars);
  }

  function addChoicelistOption(p: string, option: string) {
    const current = choicelists[p] || [];
    if (option && !current.includes(option)) {
      choicelists = { ...choicelists, [p]: [...current, option] };
    }
  }

  function removeChoicelistOption(p: string, option: string) {
    const current = choicelists[p] || [];
    choicelists = { ...choicelists, [p]: current.filter((k) => k !== option) };
  }

  function toggleChoicelistPicker(p: string) {
    choicelistOpenFor = choicelistOpenFor === p ? null : p;
  }

  // Input for adding custom text options to choicelist
  let choicelistNewText: Record<string, string> = {};

  function addChoicelistText(p: string) {
    const text = (choicelistNewText[p] || "").trim();
    if (text) {
      addChoicelistOption(p, text);
      choicelistNewText = { ...choicelistNewText, [p]: "" };
    }
  }

  function addOptional() {
    const trimmed = newOpt.trim();
    if (trimmed && !optionals.includes(trimmed)) {
      optionals = [...optionals, trimmed];
      newOpt = "";
    }
  }

  function removeOptional(i: number) {
    optionals = optionals.filter((_, idx) => idx !== i);
  }

  function moveOptional(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= optionals.length) return;
    const copy = [...optionals];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    optionals = copy;
  }

  function updateOptional(i: number, newVal: string) {
    const trimmed = newVal.trim();
    if (!trimmed) return;
    if (optionals.some((o, idx) => idx !== i && o === trimmed)) return;
    optionals = optionals.map((o, idx) => (idx === i ? trimmed : o));
  }

  function addEoOption() {
    newEoOptions = [...newEoOptions, ""];
  }

  function removeEoOption(i: number) {
    if (newEoOptions.length <= 2) return;
    newEoOptions = newEoOptions.filter((_, idx) => idx !== i);
  }

  function addEitherOrGroup() {
    const trimmed = newEoOptions.map((o) => o.trim()).filter(Boolean);
    if (trimmed.length < 2) return;
    eitherOrs = [...eitherOrs, trimmed];
    newEoOptions = ["", ""];
  }

  function removeEitherOrGroup(i: number) {
    eitherOrs = eitherOrs.filter((_, idx) => idx !== i);
  }

  function moveEitherOrGroup(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= eitherOrs.length) return;
    const copy = [...eitherOrs];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    eitherOrs = copy;
  }

  function updateEitherOrOption(gi: number, oi: number, newVal: string) {
    const trimmed = newVal.trim();
    if (!trimmed) return;
    eitherOrs = eitherOrs.map((group, gIdx) =>
      gIdx === gi ? group.map((opt, oIdx) => (oIdx === oi ? trimmed : opt)) : group
    );
  }

  function handleSave() {
    if (!canSave) return;
    // Filter choicelists to only include relevant placeholders
    const filteredChoicelists: Record<string, string[]> = {};
    for (const p of placeholders) {
      if (choicelists[p] !== undefined) {
        filteredChoicelists[p] = choicelists[p];
      }
    }
    templates.save({
      id: template?.id || genId(),
      name: name.trim(),
      body: body.trim(),
      placeholders,
      textareas: [...textareas].filter((t) => placeholders.includes(t)),
      lists: [...lists].filter((l) => placeholders.includes(l)),
      optionalVars: [...optionalVars].filter((o) => placeholders.includes(o)),
      choicelists: filteredChoicelists,
      optionals,
      eitherOrs,
      category: categoryList,
      favorite: template?.favorite || false,
    });
    onSave();
  }

  function addCategory() {
    const trimmed = newCatInput.trim();
    if (trimmed && !categoryList.includes(trimmed)) {
      categoryList = [...categoryList, trimmed];
      newCatInput = "";
    }
  }

  function removeCategory(i: number) {
    categoryList = categoryList.filter((_, idx) => idx !== i);
  }

  function selectCategory(cat: string) {
    if (!categoryList.includes(cat)) {
      categoryList = [...categoryList, cat];
    }
    newCatInput = "";
    showCatSuggestions = false;
  }
</script>

<div class="editor">
  <!-- Header -->
  <div class="header">
    <button class="back-btn" on:click={onCancel} title="Zurück">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <line x1="19" y1="12" x2="5" y2="12" />
        <polyline points="12 19 5 12 12 5" />
      </svg>
    </button>
    <h2>{template ? "Template bearbeiten" : "Neues Template"}</h2>
  </div>

  <!-- Name -->
  <div class="field">
    <label class="label" for="tpl-name">Name</label>
    <input
      id="tpl-name"
      bind:value={name}
      placeholder="z. B. Code Review"
    />
  </div>

  <!-- Categories -->
  <div class="field cat-field">
    <label class="label">Kategorien</label>
    {#if categoryList.length > 0}
      <div class="cat-tags">
        {#each categoryList as cat, i}
          <span class="cat-tag" in:fly={{ x: -6, duration: 120 }} out:fade={{ duration: 80 }}>
            {cat}
            <button class="cat-tag-remove" on:click={() => removeCategory(i)} title="Entfernen">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </span>
        {/each}
      </div>
    {/if}
    <div class="cat-input-row">
      <input
        bind:value={newCatInput}
        on:keydown={(e) => e.key === "Enter" && addCategory()}
        on:focus={() => (showCatSuggestions = true)}
        on:blur={() => setTimeout(() => (showCatSuggestions = false), 150)}
        placeholder="Kategorie hinzufügen…"
      />
      <button class="btn-secondary add-btn" on:click={addCategory} title="Hinzufügen">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </div>
    {#if showCatSuggestions && $categories.filter((c) => !categoryList.includes(c) && c.toLowerCase().includes(newCatInput.toLowerCase())).length > 0}
      <div class="cat-suggestions" transition:slide={{ duration: 120 }}>
        {#each $categories.filter((c) => !categoryList.includes(c) && c.toLowerCase().includes(newCatInput.toLowerCase())) as cat}
          <button class="cat-option" on:mousedown|preventDefault={() => selectCategory(cat)}>
            {cat}
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Body -->
  <div class="field body-field">
    <label class="label" for="tpl-body">Template-Body</label>
    <div class="body-hints">
      <span class="hint-tag">{"{{name}}"} Platzhalter</span>
      <span class="hint-tag">{"{{#name}}...{{/name}}"} Optionaler Block</span>
      <span class="hint-tag">{"[["} Snippet einfügen</span>
    </div>
    <div class="body-textarea-wrap">
      <textarea
        id="tpl-body"
        bind:this={bodyEl}
        bind:value={body}
        on:input={handleBodyInput}
        on:keydown={handleBodyKeydown}
        on:blur={handleBodyBlur}
        placeholder={"Überprüfe diesen Code:\n\n```\n{{code}}\n```"}
        rows="8"
      ></textarea>

      <!-- Autocomplete dropdown (snippets + block markers) -->
      {#if acVisible && acItems.length > 0}
        <div
          class="ac-dropdown"
          style="top: {acTop}px; left: {acLeft}px;"
          transition:fly={{ y: -4, duration: 100 }}
        >
          {#each acItems as item, i}
            <button
              class="ac-item"
              class:highlighted={i === acIndex}
              on:mousedown|preventDefault={() => insertAutocomplete(item.key)}
              on:mouseenter={() => (acIndex = i)}
            >
              <code class="ac-key">{acMode === "snippet" ? `[[${item.key}]]` : acMode === "block-open" ? `{{#${item.key}}}` : `{{/${item.key}}}`}</code>
              {#if item.desc}
                <span class="ac-desc">{item.desc}</span>
              {/if}
            </button>
          {/each}
        </div>
      {/if}
    </div>
    {#if placeholders.length > 0}
      <div class="placeholder-config" in:fade={{ duration: 120 }}>
        <span class="detected-label">Platzhalter-Typ festlegen:</span>
        <div class="placeholder-list">
          {#each placeholders as p}
            <div class="placeholder-item-wrap" in:fly={{ y: 6, duration: 120 }}>
              <div class="placeholder-item">
                <span class="placeholder-name">{`{{${p}}}`}</span>
                <div class="placeholder-controls">
                  <label class="optional-toggle" title="Ganze Zeile optional machen (Checkbox beim Ausfüllen)">
                    <input type="checkbox" checked={optionalVars.has(p)} on:change={() => toggleOptionalVar(p)} class="sr-only" />
                    <div class="opt-check-mini" class:checked={optionalVars.has(p)}>
                      {#if optionalVars.has(p)}
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      {/if}
                    </div>
                    <span class="optional-label">Optional</span>
                  </label>
                  <div class="type-toggle">
                    <button
                      class="type-btn"
                      class:active={placeholderTypes[p] === "input"}
                      on:click={() => setPlaceholderType(p, "input")}
                      title="Einzeiliges Textfeld"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                        <line x1="4" y1="12" x2="20" y2="12" />
                      </svg>
                      Input
                    </button>
                    <button
                      class="type-btn"
                      class:active={placeholderTypes[p] === "textarea"}
                      on:click={() => setPlaceholderType(p, "textarea")}
                      title="Mehrzeiliges Textfeld"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                        <line x1="4" y1="8" x2="20" y2="8" />
                        <line x1="4" y1="12" x2="20" y2="12" />
                        <line x1="4" y1="16" x2="14" y2="16" />
                      </svg>
                      Textarea
                    </button>
                    <button
                      class="type-btn"
                      class:active={placeholderTypes[p] === "list"}
                      on:click={() => setPlaceholderType(p, "list")}
                      title="Formatierte Liste"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                        <line x1="8" y1="6" x2="21" y2="6" />
                        <line x1="8" y1="12" x2="21" y2="12" />
                        <line x1="8" y1="18" x2="21" y2="18" />
                        <line x1="3" y1="6" x2="3.01" y2="6" />
                        <line x1="3" y1="12" x2="3.01" y2="12" />
                        <line x1="3" y1="18" x2="3.01" y2="18" />
                      </svg>
                      Liste
                    </button>
                    <button
                      class="type-btn"
                      class:active={placeholderTypes[p] === "choicelist"}
                      on:click={() => setPlaceholderType(p, "choicelist")}
                      title="Dropdown-Auswahl"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                      Auswahl
                    </button>
                  </div>
                </div>
              </div>
              <!-- Choicelist option editor -->
              {#if placeholderTypes[p] === "choicelist"}
                <div class="choicelist-config" in:slide={{ duration: 120 }}>
                  <span class="choicelist-hint">Definiere die Optionen, die im Builder als Dropdown erscheinen:</span>
                  {#if (choicelists[p] || []).length > 0}
                    <div class="choicelist-tags">
                      {#each choicelists[p] || [] as opt}
                        <span class="choicelist-tag" class:snippet-tag={opt.startsWith("[[")} in:fly={{ x: -6, duration: 120 }} out:fade={{ duration: 80 }}>
                          {#if opt.startsWith("[[")}
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="flex-shrink:0">
                              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
                              <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
                            </svg>
                            {opt.slice(2, -2)}
                          {:else}
                            "{opt}"
                          {/if}
                          <button class="choicelist-tag-remove" on:click={() => removeChoicelistOption(p, opt)} title="Entfernen">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
                              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        </span>
                      {/each}
                    </div>
                  {:else}
                    <span class="choicelist-empty-hint">Noch keine Optionen — füge unten Text-Optionen oder Snippets hinzu.</span>
                  {/if}
                  <!-- Add custom text option -->
                  <div class="choicelist-add-row">
                    <input
                      value={choicelistNewText[p] || ""}
                      on:input={(e) => choicelistNewText = { ...choicelistNewText, [p]: e.currentTarget.value }}
                      on:keydown={(e) => e.key === "Enter" && addChoicelistText(p)}
                      placeholder="Text-Option eingeben + Enter"
                    />
                    <button class="btn-secondary add-btn" on:click={() => addChoicelistText(p)} title="Hinzufügen">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    </button>
                  </div>
                  <!-- Add snippet as option -->
                  {#if $snippets.length > 0}
                    <div class="choicelist-picker">
                      <button class="btn-secondary choicelist-add-btn" on:click={() => toggleChoicelistPicker(p)}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
                          <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
                        </svg>
                        Snippet als Option
                      </button>
                      {#if choicelistOpenFor === p}
                        <div class="choicelist-dropdown" transition:slide={{ duration: 120 }}>
                          {#each $snippets.filter((s) => !(choicelists[p] || []).includes(`[[${s.key}]]`)) as s}
                            <button class="choicelist-option" on:click={() => { addChoicelistOption(p, `[[${s.key}]]`); choicelistOpenFor = null; }}>
                              <code class="choicelist-option-key">[[{s.key}]]</code>
                              {#if s.description}
                                <span class="choicelist-option-desc">{s.description}</span>
                              {/if}
                            </button>
                          {:else}
                            <span class="choicelist-empty">Keine weiteren Snippets verfügbar</span>
                          {/each}
                        </div>
                      {/if}
                    </div>
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Snippet references in body -->
    {#if snippetRefs.length > 0}
      <div class="snippet-refs" in:fade={{ duration: 120 }}>
        <span class="detected-label">Snippets verwendet:</span>
        <div class="snippet-ref-list">
          {#each snippetRefs as ref}
            <span class="snippet-ref-tag" class:missing={!availableSnippetKeys.includes(ref)}>
              [[{ref}]]
              {#if !availableSnippetKeys.includes(ref)}
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              {/if}
            </span>
          {/each}
        </div>
      </div>
    {/if}

  </div>

  <!-- Optionals -->
  <div class="field">
    <label class="label" for="opt-input">Optionale Anhänge</label>
    <div class="opt-input-row">
      <input
        id="opt-input"
        bind:value={newOpt}
        on:keydown={(e) => e.key === "Enter" && addOptional()}
        placeholder="z. B. Halte die Kommentare minimalistisch"
      />
      <button class="btn-secondary add-btn" on:click={addOptional} title="Hinzufügen">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </div>

    {#if optionals.length > 0}
      <div class="opt-list">
        {#each optionals as o, i (i)}
          <div
            class="opt-item"
            in:fly={{ x: -10, duration: 150 }}
            out:fade={{ duration: 100 }}
          >
            <input
              class="opt-text-edit"
              value={o}
              on:blur={(e) => updateOptional(i, e.currentTarget.value)}
              on:keydown={(e) => e.key === "Enter" && e.currentTarget.blur()}
            />
            <div class="reorder-btns">
              <button class="icon-btn reorder-btn" disabled={i === 0} on:click={() => moveOptional(i, -1)} title="Nach oben">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                  <polyline points="18 15 12 9 6 15" />
                </svg>
              </button>
              <button class="icon-btn reorder-btn" disabled={i === optionals.length - 1} on:click={() => moveOptional(i, 1)} title="Nach unten">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            </div>
            <button class="icon-btn danger" on:click={() => removeOptional(i)} title="Entfernen">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Either/Or Groups -->
  <div class="field">
    <span class="label">Entweder / Oder</span>

    <!-- Existing groups -->
    {#if eitherOrs.length > 0}
      <div class="eo-groups">
        {#each eitherOrs as group, gi (gi)}
          <div
            class="eo-group"
            in:fly={{ x: -10, duration: 150 }}
            out:fade={{ duration: 100 }}
          >
            <div class="eo-group-options">
              {#each group as opt, oi}
                {#if oi > 0}
                  <span class="eo-separator">ODER</span>
                {/if}
                <input
                  class="eo-option-edit"
                  value={opt}
                  on:blur={(e) => updateEitherOrOption(gi, oi, e.currentTarget.value)}
                  on:keydown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                />
              {/each}
            </div>
            <div class="reorder-btns">
              <button class="icon-btn reorder-btn" disabled={gi === 0} on:click={() => moveEitherOrGroup(gi, -1)} title="Nach oben">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                  <polyline points="18 15 12 9 6 15" />
                </svg>
              </button>
              <button class="icon-btn reorder-btn" disabled={gi === eitherOrs.length - 1} on:click={() => moveEitherOrGroup(gi, 1)} title="Nach unten">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            </div>
            <button class="icon-btn danger" on:click={() => removeEitherOrGroup(gi)} title="Entfernen">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        {/each}
      </div>
    {/if}

    <!-- New group builder -->
    <div class="eo-builder">
      {#each newEoOptions as opt, i}
        <div class="eo-input-row">
          {#if i > 0}
            <span class="eo-separator">ODER</span>
          {/if}
          <div class="eo-input-wrap">
            <input
              bind:value={newEoOptions[i]}
              on:keydown={(e) => e.key === "Enter" && addEitherOrGroup()}
              placeholder="Option {i + 1}…"
            />
            {#if newEoOptions.length > 2}
              <button class="icon-btn danger eo-remove-opt" on:click={() => removeEoOption(i)} title="Option entfernen">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            {/if}
          </div>
        </div>
      {/each}
      <div class="eo-actions">
        <button class="btn-secondary eo-add-opt-btn" on:click={addEoOption} title="Weitere Option">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Option
        </button>
        <button class="btn-secondary eo-add-group-btn" on:click={addEitherOrGroup} title="Gruppe hinzufügen">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Hinzufügen
        </button>
      </div>
    </div>
  </div>

  <!-- Save -->
  <button class="btn-primary save-btn" disabled={!canSave} on:click={handleSave}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
    Speichern
  </button>
</div>

<style>
  .editor {
    display: flex;
    flex-direction: column;
    gap: 22px;
  }

  .header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 4px;
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

  .field {
    display: flex;
    flex-direction: column;
  }

  .hint {
    font-weight: 400;
    color: var(--text-muted);
    font-size: 11px;
    margin-left: 8px;
    text-transform: none;
    letter-spacing: normal;
  }

  .body-textarea-wrap {
    position: relative;
  }

  .body-field textarea {
    min-height: 160px;
    font-family: "SF Mono", "Cascadia Code", "Consolas", monospace;
    font-size: 13px;
    line-height: 1.6;
  }

  .body-hints {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 6px;
  }

  .hint-tag {
    font-size: 11px;
    color: var(--text-muted);
    background: var(--bg-hover);
    padding: 2px 8px;
    border-radius: 4px;
    white-space: nowrap;
  }

  /* ── Autocomplete Dropdown ── */
  .ac-dropdown {
    position: absolute;
    z-index: 50;
    min-width: 200px;
    max-width: 320px;
    max-height: 180px;
    overflow-y: auto;
    background: var(--bg-card);
    border: 1.5px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: 4px;
  }

  .ac-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    text-align: left;
    padding: 7px 10px;
    border-radius: 6px;
    font-size: 12.5px;
    color: var(--text);
    transition: background 0.1s;
  }

  .ac-item:hover,
  .ac-item.highlighted {
    background: var(--accent-bg);
  }

  .ac-key {
    font-family: "SF Mono", "Cascadia Code", "Consolas", monospace;
    font-size: 12px;
    font-weight: 600;
    color: var(--accent);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .ac-desc {
    font-size: 11.5px;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .placeholder-config {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 12px;
  }

  .detected-label {
    font-size: 11px;
    color: var(--text-muted);
    font-weight: 500;
  }

  .placeholder-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .placeholder-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 12px;
    background: var(--bg-card);
    border: 1px solid var(--border-light);
    border-radius: var(--radius);
    transition: all var(--transition);
  }

  .placeholder-item:hover {
    border-color: var(--border);
  }

  .placeholder-name {
    font-size: 12.5px;
    font-weight: 600;
    font-family: "SF Mono", "Cascadia Code", "Consolas", monospace;
    color: var(--text);
  }

  .type-toggle {
    display: flex;
    gap: 2px;
    background: var(--bg);
    border-radius: 8px;
    padding: 2px;
    border: 1px solid var(--border-light);
  }

  .type-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    font-size: 11.5px;
    font-weight: 500;
    color: var(--text-muted);
    border-radius: 6px;
    transition: all var(--transition);
    white-space: nowrap;
  }

  .type-btn:hover {
    color: var(--text-secondary);
  }

  .type-btn.active {
    background: var(--accent);
    color: #fff;
    box-shadow: 0 1px 4px rgba(99, 102, 241, 0.25);
  }

  .cat-field {
    position: relative;
  }

  .cat-tags {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-bottom: 8px;
  }

  .cat-tag {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    font-size: 12.5px;
    font-weight: 500;
    background: var(--accent-bg);
    color: var(--accent);
    border-radius: 14px;
    border: 1px solid var(--accent-border);
  }

  .cat-tag-remove {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    color: var(--accent);
    opacity: 0.6;
    transition: opacity var(--transition);
  }

  .cat-tag-remove:hover {
    opacity: 1;
  }

  .cat-input-row {
    display: flex;
    gap: 8px;
  }

  .cat-input-row input {
    flex: 1;
  }

  .cat-suggestions {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: var(--bg-card);
    border: 1.5px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    z-index: 10;
    overflow: hidden;
    margin-top: 4px;
  }

  .cat-option {
    display: block;
    width: 100%;
    text-align: left;
    padding: 9px 14px;
    font-size: 13px;
    color: var(--text);
    transition: background var(--transition);
  }

  .cat-option:hover {
    background: var(--bg-hover);
  }

  .opt-input-row {
    display: flex;
    gap: 8px;
  }

  .opt-input-row input {
    flex: 1;
  }

  .add-btn {
    flex-shrink: 0;
    width: 42px;
    padding: 0;
  }

  .opt-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 10px;
  }

  .opt-item {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--bg-card);
    border: 1px solid var(--border-light);
    border-radius: var(--radius);
    padding: 6px 12px;
    transition: all var(--transition);
  }

  .opt-item:hover {
    border-color: var(--border);
  }

  .opt-text-edit {
    flex: 1;
    font-size: 13px;
    color: var(--text);
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    padding: 2px 6px;
    transition: all var(--transition);
  }

  .reorder-btns {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex-shrink: 0;
  }

  .reorder-btn {
    width: 24px !important;
    height: 18px !important;
    padding: 0 !important;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .reorder-btn:disabled {
    opacity: 0.25;
    cursor: default;
  }

  .opt-text-edit:focus {
    background: var(--bg);
    border-color: var(--border);
    outline: none;
  }

  .save-btn {
    width: 100%;
    padding: 13px;
    margin-top: 4px;
    font-size: 14px;
  }

  /* ── Snippet references ── */
  .snippet-refs {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 10px;
  }

  .snippet-ref-list {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .snippet-ref-tag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 9px;
    font-size: 11.5px;
    font-weight: 600;
    font-family: "SF Mono", "Cascadia Code", "Consolas", monospace;
    border-radius: 6px;
    background: var(--accent-bg);
    color: var(--accent);
  }

  .snippet-ref-tag.missing {
    background: var(--danger-bg);
    color: var(--danger);
  }

  /* ── Either/Or Groups ── */
  .eo-groups {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 10px;
  }

  .eo-group {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--bg-card);
    border: 1px solid var(--border-light);
    border-radius: var(--radius);
    padding: 10px 14px;
    transition: all var(--transition);
  }

  .eo-group:hover {
    border-color: var(--border);
  }

  .eo-group-options {
    flex: 1;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: var(--text);
  }

  .eo-option-edit {
    padding: 2px 8px;
    background: var(--accent-bg);
    border-radius: 5px;
    color: var(--text);
    border: 1px solid transparent;
    font-size: 13px;
    transition: all var(--transition);
    min-width: 60px;
  }

  .eo-option-edit:focus {
    background: var(--bg);
    border-color: var(--border);
    outline: none;
  }

  .eo-separator {
    font-size: 10px;
    font-weight: 700;
    color: var(--accent);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    flex-shrink: 0;
  }

  .eo-builder {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .eo-input-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .eo-input-wrap {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .eo-input-wrap input {
    flex: 1;
  }

  .eo-remove-opt {
    flex-shrink: 0;
  }

  .eo-actions {
    display: flex;
    gap: 8px;
    margin-top: 4px;
  }

  .eo-add-opt-btn,
  .eo-add-group-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    padding: 6px 12px;
  }

  .placeholder-item-wrap {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .placeholder-controls {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .optional-toggle {
    display: flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
    flex-shrink: 0;
  }

  .opt-check-mini {
    width: 16px;
    height: 16px;
    border-radius: 4px;
    border: 2px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all var(--transition);
    background: var(--bg);
  }

  .opt-check-mini.checked {
    background: var(--accent);
    border-color: var(--accent);
  }

  .optional-label {
    font-size: 11px;
    font-weight: 500;
    color: var(--text-muted);
    white-space: nowrap;
  }

  .choicelist-add-row {
    display: flex;
    gap: 8px;
  }

  .choicelist-add-row input {
    flex: 1;
    font-size: 12.5px;
    padding: 6px 10px;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
  }

  /* ── Choicelist Config ── */
  .choicelist-config {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
    background: var(--accent-bg);
    border: 1px solid var(--accent-border);
    border-top: none;
    border-radius: 0 0 var(--radius) var(--radius);
  }

  .choicelist-hint {
    font-size: 11px;
    color: var(--text-muted);
    line-height: 1.3;
  }

  .choicelist-empty-hint {
    font-size: 11px;
    color: var(--text-muted);
    font-style: italic;
  }

  .snippet-tag {
    background: var(--accent-bg);
    border-color: var(--accent-border);
  }

  .choicelist-tags {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .choicelist-tag {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 9px;
    font-size: 12px;
    font-weight: 600;
    font-family: "SF Mono", "Cascadia Code", "Consolas", monospace;
    background: var(--bg-card);
    color: var(--accent);
    border-radius: 6px;
    border: 1px solid var(--border-light);
  }

  .choicelist-tag-remove {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    color: var(--text-muted);
    opacity: 0.6;
    transition: opacity var(--transition);
  }

  .choicelist-tag-remove:hover {
    opacity: 1;
    color: var(--danger);
  }

  .choicelist-picker {
    position: relative;
  }

  .choicelist-add-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    padding: 5px 12px;
  }

  .choicelist-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 20;
    margin-top: 4px;
    max-height: 200px;
    overflow-y: auto;
    background: var(--bg-card);
    border: 1.5px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: 4px;
  }

  .choicelist-option {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    text-align: left;
    padding: 7px 10px;
    border-radius: 6px;
    font-size: 12.5px;
    color: var(--text);
    transition: background 0.1s;
  }

  .choicelist-option:hover {
    background: var(--accent-bg);
  }

  .choicelist-option-key {
    font-family: "SF Mono", "Cascadia Code", "Consolas", monospace;
    font-size: 12px;
    font-weight: 600;
    color: var(--accent);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .choicelist-option-desc {
    font-size: 11.5px;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .choicelist-empty {
    display: block;
    padding: 8px 10px;
    font-size: 12px;
    color: var(--text-muted);
    font-style: italic;
  }

</style>
