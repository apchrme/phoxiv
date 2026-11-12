<script lang="ts">
	import { Circle, CircleCheck, CircleDashed } from '@lucide/svelte';
	import IconFilterMenu from '#lib/components/IconFilterMenu.svelte';
	import type { ButtonSize } from '#lib/components/ui/button/index.js';
	import type { ProblemStatus } from '#lib/filters.js';

	/**
	 * The progress filter: All problems, Done or To do. Used by the olympiad page
	 * and the ⌘K dialog. Callers render it only for signed-in users.
	 */
	let {
		value = $bindable('all'),
		caption = undefined,
		size = undefined,
		class: className
	}: {
		value?: ProblemStatus;
		/** A fixed word beside the icon; see `IconFilterMenu`. */
		caption?: string;
		/** Trigger size. The ⌘K dialog uses `'icon-sm'` to fit its row on a phone. */
		size?: ButtonSize;
		class?: string;
	} = $props();

	/** Same icons as `ProgressControl`, so "not done" looks the same everywhere. */
	const OPTIONS = [
		{ value: 'all', label: 'All problems', icon: CircleDashed },
		{ value: 'done', label: 'Done', icon: CircleCheck },
		{ value: 'todo', label: 'To do', icon: Circle }
	] as const satisfies readonly { value: ProblemStatus; label: string; icon: typeof Circle }[];
</script>

<IconFilterMenu
	bind:value
	options={OPTIONS}
	heading="Filter by progress"
	{caption}
	{size}
	class={className}
/>
