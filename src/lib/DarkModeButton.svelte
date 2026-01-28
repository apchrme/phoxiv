<script lang="ts">
	import '../app.css';
	import { Sun, Moon, Monitor } from '@lucide/svelte';
	let { toggleDarkTheme, theme, systemDark } = $props();
</script>

<button
	onclick={toggleDarkTheme}
	class="rounded-2xl p-3 transition duration-150 bg-ctp-crust dark:bg-ctp-surface0 hover:bg-ctp-surface1"
	aria-label="Dark mode toggle"
>
	{#if theme == 'dark'}
		<Moon color="white" strokeWidth="2.25" size="20px" />
	{:else if theme == 'light'}
		<Sun color="black" strokeWidth="2.25" size="20px" />
	{:else if systemDark}
		<Monitor color="white" strokeWidth="2.25" size="20px" />
	{:else}
		<Monitor color="black" strokeWidth="2.25" size="20px" />
	{/if}
</button>
