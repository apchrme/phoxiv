import type { ProblemTopic } from '$lib/types';

/**
 * The client-side row model behind the year editor's metadata tab.
 *
 * The three repeaters are seeded from the loaded year once and then owned
 * entirely by the browser — they are the contributor's working draft, not a
 * view of the stored row.
 *
 * `saveMetadata` reassembles them by **position**: `note`, then
 * `linkLabel`/`linkUrl`, then `problemNumber`/`problemTitle`/`problemTopics`,
 * each zipped by index. So every row must render exactly one input per field
 * name, unconditionally and in a stable order. An input hidden behind an `{#if}`
 * shifts every later row's data into the wrong record, silently.
 *
 * Each row carries a generated `id` for one reason: `{#each}` needs a key that
 * survives reordering, and two blank rows are otherwise indistinguishable.
 */

/** One line of the year's notes. */
export type NoteRow = { id: string; value: string };

/** One external link shown alongside the year's files. */
export type LinkRow = { id: string; label: string; url: string };

/** One problem. `title` is `''` rather than `null`, since it is bound to an input. */
export type ProblemRow = {
	id: string;
	number: string;
	title: string;
	topics: ProblemTopic[];
};

function rowId(): string {
	return crypto.randomUUID();
}

/** Seeds the notes repeater from the stored `notes` array. */
export function toNoteRows(notes: readonly string[]): NoteRow[] {
	return notes.map((value) => ({ id: rowId(), value }));
}

/** Seeds the links repeater from the stored `extraLinks` array. */
export function toLinkRows(links: readonly { label: string; url: string }[]): LinkRow[] {
	return links.map((link) => ({ id: rowId(), label: link.label, url: link.url }));
}

/**
 * Seeds the problems repeater from the loaded problem rows.
 *
 * `topics` is copied rather than aliased: the row is about to become deep
 * `$state`, and mutating the loaded page data in place would be a surprise.
 */
export function toProblemRows(
	problems: readonly { number: string; title: string | null; topics: ProblemTopic[] }[]
): ProblemRow[] {
	return problems.map((problem) => ({
		id: rowId(),
		number: problem.number,
		title: problem.title ?? '',
		topics: [...problem.topics]
	}));
}

export function newNoteRow(): NoteRow {
	return { id: rowId(), value: '' };
}

export function newLinkRow(): LinkRow {
	return { id: rowId(), label: '', url: '' };
}

export function newProblemRow(): ProblemRow {
	return { id: rowId(), number: '', title: '', topics: [] };
}

/**
 * The problem numbers used by more than one row.
 *
 * Blank numbers are skipped — a freshly added row is not yet a duplicate of
 * anything. The server rejects duplicates as well, because two problems sharing
 * a number would upsert over each other and one of them would lose its files;
 * this is the client-side half, which stops the save before that can happen.
 */
export function duplicateProblemNumbers(problems: readonly ProblemRow[]): Set<string> {
	const counts = new Map<string, number>();
	for (const problem of problems) {
		const number = problem.number.trim();
		if (!number) continue;
		counts.set(number, (counts.get(number) ?? 0) + 1);
	}
	return new Set([...counts.entries()].filter(([, count]) => count > 1).map(([number]) => number));
}
