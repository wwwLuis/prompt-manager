<script lang="ts">
  import { fly, fade } from "svelte/transition";
  import { type Template } from "$lib/store";
  import TemplateList from "$lib/TemplateList.svelte";
  import TemplateEditor from "$lib/TemplateEditor.svelte";
  import PromptBuilder from "$lib/PromptBuilder.svelte";
  import SnippetManager from "$lib/SnippetManager.svelte";
  import PromptHistory from "$lib/PromptHistory.svelte";

  type View = "list" | "edit" | "use" | "snippets" | "history";

  let view: View = "list";
  let active: Template | null = null;

  function goList() {
    view = "list";
    active = null;
  }

  function goEdit(t?: Template) {
    active = t ?? null;
    view = "edit";
  }

  function goUse(t: Template) {
    active = t;
    view = "use";
  }

  function goSnippets() {
    view = "snippets";
  }

  function goHistory() {
    view = "history";
  }
</script>

{#key view}
  <div
    in:fly={{ y: 14, duration: 220, delay: 80 }}
    out:fade={{ duration: 80 }}
  >
    {#if view === "list"}
      <TemplateList
        onNew={() => goEdit()}
        onEdit={(t) => goEdit(t)}
        onUse={(t) => goUse(t)}
        onSnippets={goSnippets}
        onHistory={goHistory}
      />
    {:else if view === "edit"}
      <TemplateEditor template={active} onSave={goList} onCancel={goList} />
    {:else if view === "use" && active}
      <PromptBuilder template={active} onBack={goList} onEdit={() => goEdit(active)} />
    {:else if view === "snippets"}
      <SnippetManager onBack={goList} />
    {:else if view === "history"}
      <PromptHistory onBack={goList} />
    {/if}
  </div>
{/key}
