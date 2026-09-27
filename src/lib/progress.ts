/*
 * Progress-tracking rules, shared by client and server so the editor, the CSV
 * import and the `trackProblem` action agree on what a valid score is.
 *
 * A problem is untracked or completed, and a completed one may have a score.
 * A row in `problem_progress`, or a key in a ProgressMap, means completed.
 */

/**
 * One completed problem. No `completed` flag (the entry's presence is that) and
 * no maximum (that's on `ProblemEntry`, since it's the same for everyone).
 */
export type ProblemProgress = {
	/** The user's score, or null for "completed, no score recorded". */
	score: number | null;
};

/**
 * Progress for one olympiad, keyed by {@link progressKey}. Only tracked problems
 * have keys, so un-tracking must `delete` the key.
 */
export type ProgressMap = Record<string, ProblemProgress>;

/**
 * Progress across all olympiads, one {@link ProgressMap} per olympiad id. Nested
 * because {@link progressKey} has no olympiad, so a flat map would mix up, say,
 * IPhO 2019 T1 and APhO 2019 T1. Backs `GET /progress`.
 */
export type GlobalProgressMap = Record<string, ProgressMap>;

/**
 * The key a problem is filed under. Uses `(year, number)`, not `problems.id`,
 * because the server resolves the problem itself and the page never sees ids.
 */
export function progressKey(year: number, number: string): string {
	return `${year}:${number}`;
}

/**
 * A score for display: at most two decimals, trailing zeros dropped (`8.5`,
 * `10`, `8.25`). Display only; anything that is saved back uses {@link exactScore}.
 */
export function formatScore(value: number): string {
	return String(Math.round(value * 100) / 100);
}

/**
 * A score written in full, for inputs and CSV cells that get saved back.
 * Don't use {@link formatScore} there: it rounds, so a max of `0.001` became `0`
 * and the year editor then refused to save.
 */
export function exactScore(value: number): string {
	return String(value);
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
 * A problem's maximum score from the year editor or CSV. Blank means no maximum;
 * zero is refused (it would divide by zero). Messages follow a
 * "Maximum score for problem T1:" prefix added by the callers.
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
 * A score the user records. Blank means completed with no score. Over the max is
 * refused, not clamped, so the user's input isn't silently changed.
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
 * A year's totals. The score ratio counts only problems that are tracked, scored
 * and have a maximum:
 * - untracked problems are left out, so 4 of 12 done doesn't look worse than 4 of 4;
 * - tracked but unscored problems count only toward `completed`, not as a 0;
 * - scored problems with no maximum go in `unscaled`, which the card shows.
 *
 * Pass the year's whole problem list, never a filtered one, so filters don't
 * change the total.
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
