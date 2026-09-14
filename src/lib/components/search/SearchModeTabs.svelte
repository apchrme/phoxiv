<script lang="ts">
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import type { SearchMode } from '$lib/types.js';

	/**
	 * Switches the ⌘K dialog between problem search and deep (in-file) search.
	 *
	 * # Why tabs, and why they get a row of their own
	 *
	 * This was a 32px icon-only button (`FileSearch`, filled while files mode was
	 * on) sitting in the input row immediately beside `TopicSelect`,
	 * `StatusFilter` and the olympiad picker — built from the identical
	 * `buttonVariants({ variant: active ? 'default' : 'outline', size: 'icon-sm' })`
	 * recipe. It was therefore indistinguishable in kind from a filter and spoke
	 * the same "filled means on" language, yet it is the one control in that row
	 * that changes what a **result is**. `docs/search.md` opens by saying phoXiv
	 * has two searches that agree on almost nothing; the old row said it had one
	 * search with four filters. Tabs state the two-searches fact in the one
	 * vocabulary nobody has to be taught, and moving the switch out of the input
	 * row hands that row back the width the square was taking on a phone.
	 *
	 * **Labels, not icons.** The old button's icon was `FileSearch` rather than
	 * `Telescope` or `TextSearch` because it was the only one that named the
	 * *result kind*, which is the single most important thing to understand about
	 * this mode — the rows are files, not problems. Words do that better than any
	 * glyph, and the magnifier sits in the input row directly below, so a second
	 * search icon here would be noise.
	 *
	 * Markup only: `Tabs.List` and `Tabs.Trigger` read `Tabs.Root`'s context, so
	 * this renders *inside* the shell's `Tabs.Root`. `Tabs.Root` and the two
	 * `Tabs.Content` panels have to stay in `GlobalSearch.svelte`, because the
	 * panels are the shell's two result lists.
	 */
	let {
		/**
		 * Called when the user has *chosen* a mode and wants to type — wired by the
		 * shell to focus the input.
		 *
		 * **Hung off the triggers, not off `Tabs.Root`'s `onValueChange`.**
		 * Activation is `automatic` (the bits-ui default), so arrowing between the
		 * two tabs already changes the mode; refocusing from `onValueChange` would
		 * yank focus out of the tablist on the first arrow press and leave a
		 * keyboard user unable to arrow back. A click and an Enter/Space on an
		 * already-focused trigger — "done, let me type" — are the only two cases
		 * that want the input.
		 *
		 * Enter needs its own handler rather than riding the click a `<button>`
		 * would normally synthesise: bits-ui's trigger `onkeydown` calls
		 * `preventDefault()` on Enter and Space, so no click event is ever
		 * generated. `mergeProps` composes ours *before* bits-ui's, so this runs
		 * first; it must not `preventDefault()` itself, or it would cancel the
		 * activation it is following.
		 */
		onactivate
	}: {
		onactivate?: () => void;
	} = $props();

	function onTriggerKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ' ') onactivate?.();
	}
</script>

<Tabs.List>
	<!-- `satisfies SearchMode` on both values: a typo here would otherwise render a
	     panel with no matching tab, silently and only at runtime. -->
	<Tabs.Trigger
		value={'problems' satisfies SearchMode}
		onclick={onactivate}
		onkeydown={onTriggerKeydown}
	>
		Problems
	</Tabs.Trigger>
	<Tabs.Trigger
		value={'files' satisfies SearchMode}
		onclick={onactivate}
		onkeydown={onTriggerKeydown}
	>
		Files
	</Tabs.Trigger>
</Tabs.List>
