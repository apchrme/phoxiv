<script lang="ts">
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import { FileSearch } from '@lucide/svelte';
	import { cn } from '$lib/utils.js';
	import type { SearchMode } from '$lib/types.js';

	/**
	 * Switches the ⌘K dialog between problem search and deep (in-file) search.
	 *
	 * **A single icon-only button**, not a dropdown and not a `ToggleGroup`: there
	 * are exactly two states, the row it lives in has four controls already, and
	 * one click is the whole interaction. Filled while files mode is on, which is
	 * the established language of both filters beside it.
	 *
	 * The icon is `FileSearch` rather than `Telescope` or `TextSearch`, and the
	 * choice matters more than it looks. Those two read as "search harder";
	 * `FileSearch` is the only one that names the *result kind*, which is the
	 * single most important thing a user has to understand about this mode — the
	 * rows are files, not problems.
	 */
	let {
		mode = $bindable('problems')
	}: {
		mode?: SearchMode;
	} = $props();

	const active = $derived(mode === 'files');
	/**
	 * Says the **action** while off and the **state** while on. A toggle labelled
	 * only with its action is unreadable once pressed, and one labelled only with
	 * its state is unreadable before.
	 */
	const label = $derived(active ? 'Searching inside files' : 'Search inside files');
</script>

<button
	type="button"
	onclick={() => (mode = active ? 'problems' : 'files')}
	aria-pressed={active}
	title="{label} (⌘⇧F)"
	class={cn(
		buttonVariants({ variant: active ? 'default' : 'outline', size: 'icon-sm' }),
		'shrink-0 motion-reduce:transition-none'
	)}
>
	<!-- Uncoloured on purpose, for `TopicSelect`'s reason: it has to inherit
	     text-primary-foreground once the button fills. -->
	<FileSearch />
	<span class="sr-only">{label}</span>
</button>
