<script lang="ts">
  import "../app.css";
  import { onMount } from "svelte";
  import { writable } from "svelte/store";
  import { setContext } from "svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";

  const theme = writable<"light" | "dark">("light");
  setContext("theme", theme);

  /** Sync native titlebar theme with app theme */
  async function applyNativeTitlebarTheme(mode: "light" | "dark") {
    try {
      await getCurrentWindow().setTheme(mode === "dark" ? "dark" : "light");
    } catch (_) {
      /* non-Tauri environment (e.g. browser preview) */
    }
  }

  onMount(() => {
    const saved = localStorage.getItem("pm-theme");
    // Only switch to dark if explicitly saved – default is light
    if (saved === "dark") {
      theme.set("dark");
    }
  });

  // Keep DOM + native titlebar in sync whenever theme changes
  $: {
    document.documentElement?.setAttribute("data-theme", $theme);
    // Use .then() to ensure fire-and-forget without blocking reactivity
    applyNativeTitlebarTheme($theme).then();
  }

  function toggleTheme() {
    const next = $theme === "light" ? "dark" : "light";
    theme.set(next);
    localStorage.setItem("pm-theme", next);
  }

  setContext("toggleTheme", toggleTheme);
</script>

<div class="app-shell">
  <slot />
</div>
