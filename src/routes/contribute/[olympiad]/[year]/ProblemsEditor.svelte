<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import TopicSelect from '$lib/components/TopicSelect.svelte';
	import Repeater from '$lib/components/forms/Repeater.svelte';
	import { newProblemRow, type ProblemRow } from './metadata';

	/**
	 * The problems repeater: fields only, no `<form>`. Rows must render every
	 * input unconditionally; see `./metadata.ts`.
	 *
	 * The hidden `problemTopics` input is the only way topics reach the server,
	 * because `TopicSelect`'s menu is portalled out of the form. Removing it
	 * clears every problem's topics on save.
	 */
	let {
		rows = $bindable(),
		duplicates,
		maxScoreErrors
	}: {
		rows: ProblemRow[];
		/** Numbers used by more than one row. The parent blocks saving while non-empty. */
		duplicates: Set<string>;
		/** Problem number -> why its max score was rejected. */
		maxScoreErrors: Map<string, string>;
	} = $props();
</script>

<Card.Root>
	<Card.Header class="border-b">
		<Card.Title>Problems</Card.Title>
		<Card.Description>
			Define the problems for this year. Removing a problem <span class="text-sm font-bold"
				>or changing the problem number</span
			>
			will delete all its associated file records — and every user's tracked progress on it. Topics are
			only used by the topic filter on the olympiad page — they are never shown next to a problem, so
			they can't spoil it. The maximum score is optional: set it and a reader who tracks the problem sees
			their mark out of it, leave it blank and they can still record a score with no denominator.
		</Card.Description>
	</Card.Header>
	<Card.Content class="flex flex-col gap-3">
		<Repeater bind:rows newRow={newProblemRow} itemLabel="problem">
			{#snippet row(problem)}
				{@const isDuplicate = problem.number.trim() !== '' && duplicates.has(problem.number.trim())}
				{@const maxScoreError = maxScoreErrors.get(problem.number.trim())}
				<Input
					name="problemNumber"
					type="text"
					bind:value={problem.number}
					placeholder="T1"
					class="w-15"
					aria-invalid={isDuplicate}
				/>
				<Input
					name="problemTitle"
					type="text"
					bind:value={problem.title}
					placeholder="Problem title (optional)"
					class="min-w-40 flex-1"
				/>
				<TopicSelect
					bind:value={problem.topics}
					align="end"
					heading="Topics for {problem.number.trim() || 'this problem'}"
					class="shrink-0"
				/>
				<input type="hidden" name="problemTopics" value={JSON.stringify(problem.topics)} />
				<!-- `type="text"`, not `number`: Svelte binds number inputs as numbers,
				     breaking `parseMaxScore`, and an invalid entry reads as `''`, which
				     would silently save "no maximum". -->
				<Input
					name="problemMaxScore"
					type="text"
					inputmode="decimal"
					bind:value={problem.maxScore}
					placeholder="Max"
					class="w-20"
					aria-invalid={maxScoreError !== undefined}
				/>
			{/snippet}
			{#if duplicates.size > 0}
				<p class="text-sm text-destructive">
					Duplicate problem numbers: {[...duplicates].join(', ')}. Each problem number must be
					unique.
				</p>
			{/if}
			{#each [...maxScoreErrors] as [number, error] (number)}
				<p class="text-sm text-destructive">Maximum score for {number}: {error}.</p>
			{/each}
		</Repeater>
	</Card.Content>
</Card.Root>
