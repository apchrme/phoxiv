<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import TopicSelect from '$lib/components/TopicSelect.svelte';
	import { Plus, Trash2 } from '@lucide/svelte';
	import { newProblemRow, type ProblemRow } from './metadata';

	/**
	 * The `problemNumber` / `problemTitle` / `problemTopics` / `problemMaxScore`
	 * repeater — fields only, no `<form>`.
	 *
	 * The hidden `problemTopics` input is the *only* channel through which topics
	 * reach the server: `TopicSelect` renders its checkboxes in a portalled
	 * dropdown, physically outside the form, so its own markup never submits.
	 * Removing that input would silently clear every problem's topics on save.
	 *
	 * See `./metadata.ts` for the index-zipping contract; `rows` is `$bindable`
	 * and has no fallback for the same reasons as in `NotesEditor`.
	 */
	let {
		rows = $bindable(),
		duplicates,
		maxScoreErrors
	}: {
		rows: ProblemRow[];
		/** Numbers used by more than one row; owned by the parent, which also
		 *  blocks the save while it is non-empty. */
		duplicates: Set<string>;
		/** Problem number -> why its maximum score was refused; same ownership. */
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
		{#each rows as problem, i (problem.id)}
			<!-- `{@const}` compiles to `$derived`, so this re-evaluates as the number
			     is typed. A plain `const` in a script block would freeze at mount. -->
			{@const isDuplicate = problem.number.trim() !== '' && duplicates.has(problem.number.trim())}
			{@const maxScoreError = maxScoreErrors.get(problem.number.trim())}
			<div class="flex flex-wrap items-center gap-2">
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
				<!-- Topics are never displayed alongside the problem publicly — they
				     only power the topic filter on the olympiad page. -->
				<TopicSelect
					bind:value={problem.topics}
					align="end"
					heading="Topics for {problem.number.trim() || 'this problem'}"
					class="shrink-0"
				/>
				<input type="hidden" name="problemTopics" value={JSON.stringify(problem.topics)} />
				<!-- Unconditional, like every other field in this row: `saveMetadata`
				     zips the repeater by position, so an input behind an `{#if}` would
				     shift every later row's data into the wrong record.

				     `type="text"` rather than `type="number"`, for two reasons that both
				     end in silent data loss. Svelte coerces `bind:value` on a number
				     input to a *number*, which breaks `parseMaxScore`'s `.trim()` — and,
				     worse, a browser that judges the field invalid (`1.2.3`) reports its
				     value as `''`, so a visibly wrong entry would submit as "no maximum"
				     with nothing on screen to say so. `inputmode` still gets the numeric
				     keypad on a phone, and `parseMaxScore` is the real validator on both
				     sides regardless. -->
				<Input
					name="problemMaxScore"
					type="text"
					inputmode="decimal"
					bind:value={problem.maxScore}
					placeholder="Max"
					class="w-20"
					aria-invalid={maxScoreError !== undefined}
				/>
				<Button type="button" variant="ghost" size="icon" onclick={() => rows.splice(i, 1)}>
					<Trash2 class="size-4" />
				</Button>
			</div>
		{/each}
		<Button
			type="button"
			variant="outline"
			size="sm"
			onclick={() => rows.push(newProblemRow())}
			class="self-start"
		>
			<Plus class="size-4" /> Add problem
		</Button>
		{#if duplicates.size > 0}
			<p class="text-sm text-destructive">
				Duplicate problem numbers: {[...duplicates].join(', ')}. Each problem number must be unique.
			</p>
		{/if}
		{#each [...maxScoreErrors] as [number, error] (number)}
			<p class="text-sm text-destructive">Maximum score for {number}: {error}.</p>
		{/each}
	</Card.Content>
</Card.Root>
