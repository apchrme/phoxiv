import type { ProblemTopic } from '$lib/types';
import { exactScore, parseMaxScore } from '$lib/progress';

/**
 * Row model for the year editor's metadata tab. Rows are seeded once from the
 * load, then owned by the browser as the contributor's draft.
 *
 * `saveMetadata` zips the fields back together by position, so every row must
 * render exactly one input per field name, always, in a stable order. An input
 * behind an `{#if}` silently shifts later rows' data into the wrong record.
 *
 * The `id` is only an `{#each}` key; blank rows are otherwise identical.
 */

export type NoteRow = { id: string; value: string };

export type LinkRow = { id: string; label: string; url: string };

/** `title` and `maxScore` are `''`, not `null`, because they are bound to inputs. */
export type ProblemRow = {
	id: string;
	number: string;
	title: string;
	topics: ProblemTopic[];
	maxScore: string;
};

function rowId(): string {
	return crypto.randomUUID();
}

export function toNoteRows(notes: readonly string[]): NoteRow[] {
	return notes.map((value) => ({ id: rowId(), value }));
}

export function toLinkRows(links: readonly { label: string; url: string }[]): LinkRow[] {
	return links.map((link) => ({ id: rowId(), label: link.label, url: link.url }));
}

/** `topics` is copied so editing the draft doesn't mutate page data. */
export function toProblemRows(
	problems: readonly {
		number: string;
		title: string | null;
		topics: ProblemTopic[];
		maxScore: number | null;
	}[]
): ProblemRow[] {
	return problems.map((problem) => ({
		id: rowId(),
		number: problem.number,
		title: problem.title ?? '',
		topics: [...problem.topics],
		// `exactScore`, not `formatScore`: every row is saved back, so rounding
		// here would change every maximum on any save.
		maxScore: problem.maxScore === null ? '' : exactScore(problem.maxScore)
	}));
}

export function newNoteRow(): NoteRow {
	return { id: rowId(), value: '' };
}

export function newLinkRow(): LinkRow {
	return { id: rowId(), label: '', url: '' };
}

export function newProblemRow(): ProblemRow {
	return { id: rowId(), number: '', title: '', topics: [], maxScore: '' };
}

/**
 * Problem numbers used by more than one row, ignoring blanks. Shared by the
 * editor and `saveMetadata`, since duplicates would lose one problem's files.
 */
export function duplicateProblemNumbers(problems: readonly { number: string }[]): Set<string> {
	const counts = new Map<string, number>();
	for (const problem of problems) {
		const number = problem.number.trim();
		if (!number) continue;
		counts.set(number, (counts.get(number) ?? 0) + 1);
	}
	return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([number]) => number));
}

/**
 * Rows whose max score {@link parseMaxScore} rejects, by problem number.
 * Blank-number rows are skipped because `saveMetadata` discards them.
 * Shared by the editor and the server.
 */
export function invalidMaxScores(
	problems: readonly { number: string; maxScore: string }[]
): { number: string; error: string }[] {
	const invalid: { number: string; error: string }[] = [];
	for (const problem of problems) {
		const number = problem.number.trim();
		if (!number) continue;
		const parsed = parseMaxScore(problem.maxScore);
		if (!parsed.ok) invalid.push({ number, error: parsed.error });
	}
	return invalid;
}
