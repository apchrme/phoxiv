import type { Actions, PageServerLoad } from './$types';
import { requireOlympiad, toOlympiadEntry } from '$lib/server/db/queries/olympiads';
import {
	clearProblemProgress,
	findTrackableProblem,
	setProblemProgress
} from '$lib/server/db/queries/progress';
import { actionFail, field, ok, parseYear } from '$lib/server/forms';
import { parseScore, progressKey, type ProblemProgress } from '$lib/progress';

/**
 * Only the olympiad's own metadata. The years, problems and files are fetched
 * client-side from `/api/olympiads/[olympiad]` so they come out of Cloudflare's
 * shared cache instead of costing a D1 read per visit; the signed-in user's
 * progress comes from `./progress` for the opposite reason — it must never be
 * cached at all.
 */
export const load: PageServerLoad = async ({ params, locals }) => {
	return { olympiad: toOlympiadEntry(await requireOlympiad(locals.db, params.olympiad)) };
};

export const actions: Actions = {
	/**
	 * Marks a problem completed, records a score against it, or un-marks it.
	 *
	 * The guard is a plain `locals.user` check rather than one of `guard.ts`'s
	 * three: **any** signed-in user may track **any** problem. This is not an
	 * editing permission, and routing it through `requireOlympiadEditor` would
	 * limit tracking to contributors.
	 *
	 * The problem is resolved from `(olympiad, year, number)` server-side, which
	 * is what lets the page stay ignorant of `problems.id` and so keeps the
	 * publicly cached `/api/olympiads/[olympiad]` payload unchanged. The maximum
	 * score a submitted score is validated against comes from that row too, never
	 * from the browser.
	 *
	 * Nothing here is written to `activity_log`: that is the *content* audit
	 * trail shown on the admin panel, and one row per problem click would bury it.
	 */
	trackProblem: async ({ request, params, locals }) => {
		if (!locals.user) return actionFail(401, 'trackProblem', 'Sign in to track problems');

		const data = await request.formData();
		const intent = field(data, 'intent');
		const year = parseYear(field(data, 'year'));
		const number = field(data, 'number');
		if (year === null || !number) return actionFail(400, 'trackProblem', 'Missing problem');

		const problem = await findTrackableProblem(locals.db, params.olympiad, year, number);
		if (!problem) return actionFail(404, 'trackProblem', `Problem ${number} not found`);

		const key = progressKey(year, number);

		if (intent === 'remove') {
			await clearProblemProgress(locals.db, locals.user.id, problem.id);
			const entry: ProblemProgress = { maxScore: problem.maxScore, completed: false, score: null };
			return ok('trackProblem', { key, entry });
		}

		if (intent !== 'save' && intent !== 'complete') {
			return actionFail(400, 'trackProblem', 'Unknown tracking action');
		}

		// `complete` marks the problem done without looking at the score field at
		// all, so the "I did this one, never mind the mark" path cannot be blocked
		// by whatever happens to be sitting in the input.
		const parsed = parseScore(intent === 'complete' ? '' : field(data, 'score'), problem.maxScore);
		// Refused, not clamped: a silent clamp would store a number the user never
		// typed, and `actionFail` keeps the popover's input intact where `error()`
		// would replace the whole page.
		if (!parsed.ok) return actionFail(400, 'trackProblem', parsed.error);

		await setProblemProgress(locals.db, locals.user.id, problem.id, parsed.value);
		const entry: ProblemProgress = {
			maxScore: problem.maxScore,
			completed: true,
			score: parsed.value
		};
		// The canonical entry travels back with the result, so the page can merge
		// it straight into its map instead of refetching the whole olympiad.
		return ok('trackProblem', { key, entry });
	}
};
