<script lang="ts">
	import FileBadge from '$lib/components/FileBadge.svelte';
	import type { ProblemEntry } from '$lib/types';

	/**
	 * One problem: its number, optional title, and its files.
	 *
	 * Topics are deliberately not rendered — knowing a problem's topic would
	 * spoil it. They exist only to drive the filter.
	 */
	let { problem }: { problem: ProblemEntry } = $props();
</script>

<div class="flex flex-col gap-2 rounded-xl bg-muted/50 p-5">
	<div class="flex flex-col gap-0.5">
		<span class="font-mono text-base font-semibold text-primary">{problem.number}</span>
		{#if problem.title}
			<span class="text-base leading-snug font-medium text-foreground">{problem.title}</span>
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
