<script lang="ts">
	import FileBadge from '$lib/components/FileBadge.svelte';
	import type { ProblemEntry } from '$lib/types';
	import type { Pending } from '$lib/forms.svelte';
	import type { ProblemProgress } from '$lib/progress';
	import ProgressControl from './ProgressControl.svelte';

	/**
	 * One problem: its number, optional title, its files, and — for a signed-in
	 * user — the control that marks it done.
	 *
	 * Topics are deliberately not rendered — knowing a problem's topic would
	 * spoil it. They exist only to drive the filter.
	 */
	let {
		problem,
		year,
		entry,
		pending,
		signedIn
	}: {
		problem: ProblemEntry;
		/** The competition year, which the tracking action needs to resolve the problem. */
		year: number;
		/** This problem's progress, or `undefined` when it has neither a mark nor a maximum. */
		entry: ProblemProgress | undefined;
		/** The page's single tracker, so the buttons can disable themselves. */
		pending: Pending;
		signedIn: boolean;
	} = $props();
</script>

<div class="flex flex-col gap-2 rounded-xl bg-muted/50 p-5">
	<div class="flex items-start justify-between gap-2">
		<div class="flex flex-col gap-0.5">
			<span class="font-mono text-base font-semibold text-primary">{problem.number}</span>
			{#if problem.title}
				<span class="text-base leading-snug font-medium text-foreground">{problem.title}</span>
			{/if}
		</div>
		{#if signedIn}
			<ProgressControl {year} number={problem.number} {entry} {pending} />
		{/if}
	</div>
	<div class="flex flex-wrap gap-2">
		{#each problem.files as file (file.label)}
			<FileBadge
				href={file.url}
				label={file.label}
				class="px-2.5 py-2.5 text-sm hover:border-primary/40 dark:hover:border-primary/30"
			/>
		{/each}
	</div>
</div>
