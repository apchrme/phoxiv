/**
 * Problem tracking: the rules a signed-in user's progress obeys.
 *
 * Client-safe, for the same reason [`utils/topics.ts`](./utils/topics.ts) is —
 * the year editor, the CSV import, the `trackProblem` action and the problem
 * cards must all agree on exactly one definition of "a valid score", "a valid
 * maximum" and "how a score is written down". A second copy of any of those
 * would eventually disagree with the first, and the disagreement would show up
 * as a save the editor allows and the server rejects.
 *
 * A problem is either untracked or completed; a completed problem *may* carry a
 * score. There is no third state — see `problem_progress` in
 * `server/db/schema.ts`, where the row's existence is the completion flag. That
 * invariant holds on the wire too: in a {@link ProgressMap} the *key's*
 * existence is the completion flag.
 */

/**
 * What the tracking UI knows about one problem the user has completed.
 *
 * A score and nothing else. There is deliberately no `completed` field and no
 * maximum: completion is carried by the entry's existence in a
 * {@link ProgressMap}, and the maximum is the same for every visitor, so it
 * rides on `ProblemEntry` in the shared-cached `/api/olympiads/[olympiad]` body
 * rather than travelling per user.
 */
export type ProblemProgress = {
	/** The user's score, or null for "completed, no score recorded". */
	score: number | null;
};

/**
 * Progress for one olympiad, keyed by {@link progressKey}.
 *
 * The keys are **exactly** the problems the user has tracked — there are no
 * hollow entries, and an absent key is the only spelling of "untracked". That
 * mirrors `problem_progress`, where the row's existence *is* completion, and it
 * is why a removal has to `delete` the key rather than write a tombstone.
 */
export type ProgressMap = Record<string, ProblemProgress>;

/**
 * The key a problem is filed under.
 *
 * `(year, number)` rather than `problems.id`: the olympiad page never learns a
 * problem's row id, because `?/trackProblem` resolves the problem server-side
 * from `(olympiad, year, number)`. Nothing on the page has a use for the id, so
 * nothing puts it on the wire.
 */
export function progressKey(year: number, number: string): string {
	return `${year}:${number}`;
}

/**
 * A score as it is written on screen: at most two decimals, trailing zeros
 * dropped — `8.5`, `10`, `8.25`.
 *
 * The single formatter for every surface, cards and year totals and the CSV
 * alike, so an exported `max_score` always round-trips back through
 * {@link parseMaxScore} unchanged. Rounding happens *here and nowhere else*:
 * scores are stored exactly as entered, because rounding three marks of `8.333`
 * on the way in would make them sum to `24.99` where the honest answer is `25`.
 */
export function formatScore(value: number): string {
	return String(Math.round(value * 100) / 100);
}

/** Either a parsed value (`null` meaning "left blank") or a message to show. */
export type ScoreParse = { ok: true; value: number | null } | { ok: false; error: string };

/** A finite number, or `null` if the field is blank or unparseable. */
function toNumber(raw: string): number | null {
	const trimmed = raw.trim();
	if (!trimmed) return null;
	const value = Number(trimmed);
	return Number.isFinite(value) ? value : null;
}

/**
 * A problem's maximum score, as typed into the year editor or a CSV cell.
 *
 * Blank means "no maximum", which is a legitimate value — most problems have
 * none. A maximum of zero is refused rather than stored: it would be a
 * denominator of zero everywhere it is used.
 *
 * The messages are written to follow a `Maximum score for problem T1:` prefix,
 * because both callers that show one — the year editor and `saveMetadata` — name
 * the offending problem first. {@link parseScore}'s messages stand alone
 * instead, since a rejected score is toasted on its own.
 */
export function parseMaxScore(raw: string): ScoreParse {
	const trimmed = raw.trim();
	if (!trimmed) return { ok: true, value: null };

	const value = toNumber(trimmed);
	if (value === null) return { ok: false, error: `"${trimmed}" is not a number` };
	if (value <= 0) return { ok: false, error: 'must be greater than 0' };
	return { ok: true, value };
}

/**
 * A score the user is recording against a problem.
 *
 * Blank means "completed, no score recorded". Where a maximum is configured the
 * score is bounded by it, and an over-max score is *refused* rather than clamped
 * — a silent clamp throws away what the user actually meant to enter.
 */
export function parseScore(raw: string, maxScore: number | null): ScoreParse {
	const trimmed = raw.trim();
	if (!trimmed) return { ok: true, value: null };

	const value = toNumber(trimmed);
	if (value === null) return { ok: false, error: `"${trimmed}" is not a number` };
	if (value < 0) return { ok: false, error: 'Score cannot be negative' };
	if (maxScore !== null && value > maxScore) {
		return { ok: false, error: `Score cannot be more than ${formatScore(maxScore)}` };
	}
	return { ok: true, value };
}

/** One year's running total, as shown in the top-right of its card. */
export type YearTotals = {
	/** Tracked problems in the year. */
	completed: number;
	/** Problems in the year, tracked or not. */
	total: number;
	/** Σ score over the ratio set. */
	score: number;
	/** Σ maxScore over the ratio set. */
	maxScore: number;
	/** Scored problems left out of the ratio for want of a maximum. */
	unscaled: number;
};

/**
 * A year's totals over the problems the user has tracked.
 *
 * The **ratio set is exactly the problems that are tracked *and* scored *and*
 * have a maximum**, and each of those three conditions earns its place:
 *
 * - Untracked problems are excluded so that having done four problems out of
 *   twelve never makes the ratio look worse than four out of four.
 * - Tracked-but-unscored problems count toward `completed` only. Folding their
 *   maximum in with a zero numerator would read as "I scored 0", which is the
 *   opposite of what marking a problem complete means.
 * - Scored problems with no maximum have no denominator to contribute, so they
 *   are counted in `unscaled` instead — the card says so, rather than quietly
 *   under-reporting.
 *
 * Each maximum is read off the **problem**, not off the progress entry, because
 * that is where it now lives. So `problems` supplies the denominators as well as
 * the membership, which makes the next paragraph matter twice over.
 *
 * Always computed from a year's *whole* problem list, never from the filtered
 * one: a topic or search filter must not change the year's total.
 */
export function yearTotals(
	year: number,
	problems: readonly { number: string; maxScore?: number }[],
	progress: ProgressMap
): YearTotals {
	const totals: YearTotals = {
		completed: 0,
		total: problems.length,
		score: 0,
		maxScore: 0,
		unscaled: 0
	};

	for (const problem of problems) {
		const entry = progress[progressKey(year, problem.number)];
		// The key's presence is the completion flag; there is no field to read.
		if (entry === undefined) continue;
		totals.completed++;
		if (entry.score === null) continue;
		if (problem.maxScore === undefined) {
			totals.unscaled++;
			continue;
		}
		totals.score += entry.score;
		totals.maxScore += problem.maxScore;
	}

	return totals;
}
