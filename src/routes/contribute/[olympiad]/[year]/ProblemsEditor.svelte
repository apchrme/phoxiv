<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import TopicSelect from '$lib/components/TopicSelect.svelte';
	import { Plus, Trash2 } from '@lucide/svelte';
	import { newProblemRow, type ProblemRow } from './metadata';

	/**
	 * The `problemNumber` / `problemTitle` / `problemTopics` repeater — fields
	 * only, no `<form>`.
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
		duplicates
	}: {
		rows: ProblemRow[];
		/** Numbers used by more than one row; owned by the parent, which also
		 *  blocks the save while it is non-empty. */
		duplicates: Set<string>;
	} = $props();
</script>

<Card.Root>
	<Card.Header class="border-b">
		<Card.Title>Problems</Card.Title>
		<Card.Description>
			Define the problems for this year. Removing a problem <span class="text-sm font-bold"
				>or changing the problem number</span
			> will delete all its associated file records. Topics are only used by the topic filter on the olympiad
			page — they are never shown next to a problem, so they can't spoil it.
		</Card.Description>
	</Card.Header>
	<Card.Content class="flex flex-col gap-3">
		{#each rows as problem, i (problem.id)}
			<!-- `{@const}` compiles to `$derived`, so this re-evaluates as the number
			     is typed. A plain `const` in a script block would freeze at mount. -->
			{@const isDuplicate = problem.number.trim() !== '' && duplicates.has(problem.number.trim())}
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
	</Card.Content>
</Card.Root>
