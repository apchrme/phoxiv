<script lang="ts">
	import type { PageData } from './$types';
	import { enhance, type ActionResult, type SubmitFunction } from '$app/forms';
	import { confirmBeforeLeaving, type Pending } from '#lib/forms.svelte.js';
	import { Save, Trash } from '@lucide/svelte';
	import SubmitButton from '#lib/components/forms/SubmitButton.svelte';
	import ConfirmSubmit from '#lib/components/forms/ConfirmSubmit.svelte';
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

	/**
	 * The draft as `saveMetadata` reads it: row ids are only `{#each}` keys, so
	 * they're left out. Compared as strings so a reorder counts as an edit.
	 */
	function snapshot(): string {
		return JSON.stringify([
			notes.map((note) => note.value),
			extraLinks.map((link) => [link.label, link.url]),
			problemList.map((p) => [p.number, p.title, p.topics, p.maxScore])
		]);
	}

	/**
	 * The draft as last saved. Compared against the draft, not the load: a save
	 * doesn't reseed the draft, and the server trims and drops blank rows, so the
	 * reloaded data would disagree with a draft that was saved as typed.
	 */
	let saved = $state(snapshot());
	const dirty = $derived(snapshot() !== saved);

	// Nothing is saved until "Save metadata", so warn before leaving with edits, as
	// the olympiad editor does. Switching to the Files tab isn't a navigation, and
	// the draft survives it. `allowLeave` is called once `deleteYear` redirects,
	// so the move off the page isn't stopped.
	const allowLeave = confirmBeforeLeaving(
		() => dirty,
		'You have unsaved changes to this year. Leave without saving?'
	);

	/**
	 * `track`'s submit function, plus `start()`'s handler for the result before the
	 * page updates. `start` runs at submit, so it can capture the draft as sent
	 * rather than as it is when the response arrives.
	 */
	function withResult(
		track: SubmitFunction,
		start: () => (result: ActionResult) => void
	): SubmitFunction {
		return async (input) => {
			const handle = start();
			const after = await track(input);
			// The guard cancelled the submission.
			if (!after) return;
			return async (options) => {
				handle(options.result);
				await after(options);
			};
		};
	}

	// The page's one `Pending` never changes, and `use:enhance` captures these at
	// mount anyway, so reading `pending` once is right.
	// svelte-ignore state_referenced_locally
	const submitSave = withResult(pending.track('metadata', { guard: saveError }), () => {
		const sent = snapshot();
		return (result) => {
			if (result.type === 'success') saved = sent;
		};
	});

	// svelte-ignore state_referenced_locally
	const submitDelete = withResult(pending.track('deleteYear', { reset: true }), () => (result) => {
		if (result.type === 'redirect') allowLeave();
	});
</script>

<form
	method="POST"
	action="?/saveMetadata"
	use:enhance={submitSave}
	class="flex flex-col gap-5 pb-2"
>
	<!-- Bound: the editors add and remove rows in the parent's state. -->
	<NotesEditor bind:rows={notes} />
	<LinksEditor bind:rows={extraLinks} />
	<ProblemsEditor bind:rows={problemList} {duplicates} {maxScoreErrors} />

	<div class="flex items-center gap-3">
		<SubmitButton
			{pending}
			key="metadata"
			icon={Save}
			busyLabel="Saving…"
			disabled={saveError() !== null}
		>
			Save metadata
		</SubmitButton>
		{#if dirty}
			<span class="text-xs text-muted-foreground">Unsaved changes</span>
		{/if}
	</div>
</form>

<!-- Keep this a sibling of the form above. Nested, the parser drops this tag and
     the button would submit `?/saveMetadata` instead. -->
<form method="POST" action="?/deleteYear" use:enhance={submitDelete}>
	<ConfirmSubmit
		{pending}
		key="deleteYear"
		icon={Trash}
		title="Delete {olympiadName} {year.year}?"
		description="The year, its problems, and all of its uploaded files are permanently removed — along with every user's tracked progress on those problems. This cannot be undone."
		confirmLabel="Delete year"
	>
		Delete this year
	</ConfirmSubmit>
</form>
