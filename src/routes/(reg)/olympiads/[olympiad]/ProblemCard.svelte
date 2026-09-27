<script lang="ts">
	import FileBadge from '$lib/components/FileBadge.svelte';
	import type { ProblemEntry } from '$lib/types';
	import type { Pending } from '$lib/forms.svelte';
	import type { ProblemProgress } from '$lib/progress';
	import ProgressControl from './ProgressControl.svelte';
	import SignInToTrack from './SignInToTrack.svelte';

	/**
	 * One problem: number, title, files, and the tracking control (or a sign-in
	 * stand-in). Never render topics here: they would spoil the problem.
	 */
	let {
		problem,
		year,
		entry,
		pending,
		signedIn
	}: {
		problem: ProblemEntry;
		year: number;
		/** `undefined` when the user hasn't tracked this problem. */
		entry: ProblemProgress | undefined;
		/** The page's single `Pending`, so the buttons can disable themselves. */
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
			<ProgressControl
				{year}
				number={problem.number}
				maxScore={problem.maxScore ?? null}
				{entry}
				{pending}
			/>
		{:else}
			<SignInToTrack number={problem.number} />
		{/if}
	</div>
	<div class="flex flex-wrap gap-2">
		{#each problem.files as file (file.label)}
			<FileBadge href={file.url} label={file.label} />
		{/each}
	</div>
</div>
