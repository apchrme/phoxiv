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
	 * Phase 1 of the year editor: the notes, links and problems the year is made
	 * of, saved in one shot by `?/saveMetadata`.
	 *
	 * The three repeaters live here rather than in the editors below because the
	 * form, the submit button and the validity checks all have to agree on the
	 * same array. In particular `hasDuplicates` gates both `use:enhance`'s guard
	 * and the button's `disabled` — splitting them across a component boundary
	 * would let one drift out of step with the other. A refused maximum score is
	 * gated exactly the same way, by the same triple.
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
		/** The page's single tracker, so the buttons can disable themselves. */
		pending: Pending;
	} = $props();

	// Seeded from the load exactly once. These are the contributor's draft, so
	// they must survive a tab switch and a failed save; deep `$state` is what
	// lets the row editors bind straight into the objects.
	// svelte-ignore state_referenced_locally
	let notes = $state(toNoteRows(year.notes));
	// svelte-ignore state_referenced_locally
	let extraLinks = $state(toLinkRows(year.extraLinks));
	// svelte-ignore state_referenced_locally
	let problemList = $state(toProblemRows(problems));

	const duplicates = $derived(duplicateProblemNumbers(problemList));
	const hasDuplicates = $derived(duplicates.size > 0);

	// Keyed by problem number so `ProblemsEditor` can flag the offending row, and
	// so the message below can name it. Duplicate numbers are refused separately,
	// so in practice each key belongs to exactly one row.
	const badMaxScores = $derived(invalidMaxScores(problemList));
	const maxScoreErrors = $derived(new Map(badMaxScores.map((b) => [b.number, b.error])));

	/** The one message shown for whichever problem is blocking the save. */
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
	<!-- Bound, not merely passed: each editor adds and removes its own rows, and
	     Svelte only allows a child to mutate state the parent owns across `bind:`. -->
	<NotesEditor bind:rows={notes} />
	<LinksEditor bind:rows={extraLinks} />
	<ProblemsEditor bind:rows={problemList} {duplicates} {maxScoreErrors} />

	<!-- The spinner used to sit *beside* this button rather than in it, one of the
	     three competing busy shapes `SubmitButton` settles. -->
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

<!--
	A sibling of the form above, never a descendant of it. HTML forbids nested
	forms: the parser would drop this `<form>` tag and the button below would
	quietly submit `?/saveMetadata` instead of deleting the year.
-->
<form
	method="POST"
	action="?/deleteYear"
	use:enhance={pending.track('deleteYear', { reset: true })}
>
	<!-- The confirmation moved out of `pending.track`'s `confirm` and into the
	     dialog: this asks first and submits after, where that submitted first and
	     cancelled inline. See `ConfirmSubmit`. -->
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
