<script lang="ts">
	import type { ProblemEntry } from '#lib/types.js';
	import type { Pending } from '#lib/forms.svelte.js';
	import type { ProblemProgress } from '#lib/progress.js';
	import ProgressControl from './ProgressControl.svelte';
	import SignInToTrack from './SignInToTrack.svelte';

	/**
	 * One problem without files, as a single line: number, title and the tracking
	 * control. There is nothing to open, so it doesn't get a `ProblemCard`.
	 * Rendered as an `<li>`; `YearPanel` supplies the list.
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

	/** Into the row's vertical and right padding, so the button doesn't make the row taller. */
	const controlPosition = '-my-1 -mr-2';
</script>

<li class="flex items-center gap-3 px-4 py-2 sm:px-5">
	<div class="flex min-w-0 flex-1 items-baseline gap-3">
		<span class="shrink-0 font-mono text-sm font-semibold text-primary">{problem.number}</span>
		{#if problem.title}
			<span class="min-w-0 text-sm leading-snug text-foreground">{problem.title}</span>
		{/if}
	</div>
	{#if signedIn}
		<ProgressControl
			{year}
			number={problem.number}
			maxScore={problem.maxScore ?? null}
			{entry}
			{pending}
			class={controlPosition}
		/>
	{:else}
		<SignInToTrack number={problem.number} class={controlPosition} />
	{/if}
</li>
