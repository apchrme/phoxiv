import type { ProblemTopic } from '$lib/types';
import { exactScore, parseMaxScore } from '$lib/progress';

/**
 * The client-side row model behind the year editor's metadata tab.
 *
 * The three repeaters are seeded from the loaded year once and then owned
 * entirely by the browser — they are the contributor's working draft, not a
 * view of the stored row.
 *
 * `saveMetadata` reassembles them by **position**: `note`, then
 * `linkLabel`/`linkUrl`, then
 * `problemNumber`/`problemTitle`/`problemTopics`/`problemMaxScore`, each zipped
 * by index. So every row must render exactly one input per field name,
 * unconditionally and in a stable order. An input hidden behind an `{#if}`
 * shifts every later row's data into the wrong record, silently.
 *
 * Each row carries a generated `id` for one reason: `{#each}` needs a key that
 * survives reordering, and two blank rows are otherwise indistinguishable.
 */

/** One line of the year's notes. */
export type NoteRow = { id: string; value: string };

/** One external link shown alongside the year's files. */
export type LinkRow = { id: string; label: string; url: string };

/**
 * One problem.
 *
 * `title` and `maxScore` are `''` rather than `null`, since both are bound to an
 * input; `''` is what "no title" and "no maximum score" look like in the DOM.
 */
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
		// Through `exactScore` and never `formatScore`: this seeds an input the
		// contributor saves back, and `saveMetadata` upserts *every* problem row,
		// so rounding here would re-round every maximum in the year each time
		// anyone edited a note. A stored `8.333` must come back as `8.333`.
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
 * The problem numbers used by more than one row.
 *
 * Blank numbers are skipped — a freshly added row is not yet a duplicate of
 * anything. Two problems sharing a number would upsert over each other and one
 * of them would lose its files, so `saveMetadata` calls this too and refuses the
 * save; the editor calls it to flag the rows before the contributor gets there.
 *
 * The parameter is widened past `ProblemRow` so the server's plain
 * `{ number }` records fit — it must stay the *same* check on both sides.
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
 * The rows whose maximum-score cell {@link parseMaxScore} refuses.
 *
 * Rows with a blank number are skipped, exactly as in
 * {@link duplicateProblemNumbers} and for the same reason: `saveMetadata`
 * discards them before it validates anything, so a stray character left in a row
 * the contributor is about to delete must not block the save.
 *
 * Reported by problem number rather than by row identity so the *server* — whose
 * records have no row id — can name the offending problem in its error. The
 * parameter is widened past `ProblemRow` for the same reason: it must stay the
 * *same* check on both sides.
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
