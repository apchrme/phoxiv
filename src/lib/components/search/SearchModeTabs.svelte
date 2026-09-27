<script lang="ts">
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import type { SearchMode } from '$lib/types.js';

	/**
	 * Switches the ⌘K dialog between problem search and deep (in-file) search.
	 *
	 * Tabs with text labels, in their own row, not an icon button among the
	 * filters: this changes what a result is, so it must not look like a filter.
	 *
	 * Renders inside `GlobalSearch.svelte`'s `Tabs.Root`, which owns the two
	 * result panels.
	 */
	let {
		/**
		 * Called when the user has chosen a mode and wants to type; the shell
		 * focuses the input.
		 *
		 * Wired to the triggers, not `onValueChange`: arrowing between tabs
		 * already changes the mode, and refocusing then would pull focus out of
		 * the tablist. Only a click or Enter/Space should.
		 *
		 * Enter/Space need their own handler because bits-ui prevents the default
		 * on them, so no click fires. Ours runs first; it must not
		 * `preventDefault()` or it cancels the activation.
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
	<!-- `satisfies SearchMode` catches a typo that would leave a panel with no tab. -->
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
