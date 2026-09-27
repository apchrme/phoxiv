<script lang="ts">
	import type { PageData } from './$types';
	import { enhance } from '$app/forms';
	import type { Pending } from '$lib/forms.svelte';
	import { Save, Trash2 } from '@lucide/svelte';
	import SubmitButton from '$lib/components/forms/SubmitButton.svelte';
	import ConfirmSubmit from '$lib/components/forms/ConfirmSubmit.svelte';
	import NotesEditor from './NotesEditor.svelte';
	import LinksEditor from './LinksEditor.svelte';
	import ProblemsEditor from './ProblemsEditor.svelte';
	import {
		duplicateProblemNumbers,
		invalidMaxScores,
		toLinkRows,
		toNoteRows,
		toProblemRows
	} from './metadata';

	/**
	 * The year's notes, links and problems, saved together by `?/saveMetadata`.
	 * The row state lives here so the form guard and the button's `disabled` use
	 * the same checks.
	 */
	let {
		olympiadName,
		year,
		problems,
		pending
	}: {
		olympiadName: string;
		year: PageData['year'];
		problems: PageData['problems'];
		/** The page's single `Pending`, so the buttons can disable themselves. */
		pending: Pending;
	} = $props();

	// Seeded once: the draft must survive a tab switch and a failed save.
	// svelte-ignore state_referenced_locally
	let notes = $state(toNoteRows(year.notes));
	// svelte-ignore state_referenced_locally
	let extraLinks = $state(toLinkRows(year.extraLinks));
	// svelte-ignore state_referenced_locally
	let problemList = $state(toProblemRows(problems));

	const duplicates = $derived(duplicateProblemNumbers(problemList));
	const hasDuplicates = $derived(duplicates.size > 0);

	// Keyed by problem number so `ProblemsEditor` can flag the row.
	const badMaxScores = $derived(invalidMaxScores(problemList));
	const maxScoreErrors = $derived(new Map(badMaxScores.map((b) => [b.number, b.error])));

	function saveError(): string | null {
		if (hasDuplicates) {
			return 'Duplicate problem numbers found — please make them unique before saving.';
		}
		const [bad] = badMaxScores;
		if (bad) return `Maximum score for problem ${bad.number}: ${bad.error}.`;
		return null;
	}
</script>

<form
	method="POST"
	action="?/saveMetadata"
	use:enhance={pending.track('metadata', { guard: saveError })}
	class="flex flex-col gap-5 pb-2"
>
	<!-- Bound: the editors add and remove rows in the parent's state. -->
	<NotesEditor bind:rows={notes} />
	<LinksEditor bind:rows={extraLinks} />
	<ProblemsEditor bind:rows={problemList} {duplicates} {maxScoreErrors} />

	<SubmitButton
		{pending}
		key="metadata"
		icon={Save}
		busyLabel="Saving…"
		disabled={saveError() !== null}
		class="self-start"
	>
		Save metadata
	</SubmitButton>
</form>

<!-- Keep this a sibling of the form above. Nested, the parser drops this tag and
     the button would submit `?/saveMetadata` instead. -->
<form
	method="POST"
	action="?/deleteYear"
	use:enhance={pending.track('deleteYear', { reset: true })}
>
	<ConfirmSubmit
		{pending}
		key="deleteYear"
		icon={Trash2}
		title="Delete {olympiadName} {year.year}?"
		description="The year, its problems, and all of its uploaded files are permanently removed — along with every user's tracked progress on those problems. This cannot be undone."
		confirmLabel="Delete year"
	>
		Delete this year
	</ConfirmSubmit>
</form>
