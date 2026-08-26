<script lang="ts">
	import FileBadge from '$lib/components/FileBadge.svelte';
	import type { ProblemEntry } from '$lib/types';
	import type { Pending } from '$lib/forms.svelte';
	import type { ProblemProgress } from '$lib/progress';
	import ProgressControl from './ProgressControl.svelte';
	import SignInToTrack from './SignInToTrack.svelte';

	/**
	 * One problem: its number, optional title, its files, and the control that
	 * marks it done — live for a signed-in user, and a dimmed stand-in that
	 * explains itself for everyone else, so the feature is at least discoverable
	 * without an account.
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
		/** This problem's progress, or `undefined` when the user has not tracked it. */
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
			<!-- The maximum comes off the problem, not off `entry`: it is public metadata
			     that arrives with the rest of the problem, and `?? null` is only the
			     omitted-vs-nullable translation between `ProblemEntry` and the control. -->
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
			<FileBadge
				href={file.url}
				label={file.label}
				class="px-2.5 py-2.5 text-sm hover:border-primary/40 dark:hover:border-primary/30"
			/>
		{/each}
	</div>
</div>
