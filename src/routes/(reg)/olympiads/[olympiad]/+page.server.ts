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
 * Only the olympiad's metadata. Years, problems and files come from the cached
 * `/api/olympiads/[olympiad]`; the user's progress from the uncached `./progress`.
 */
export const load: PageServerLoad = async ({ params, locals }) => {
	return { olympiad: toOlympiadEntry(await requireOlympiad(locals.db, params.olympiad)) };
};

export const actions: Actions = {
	/**
	 * Marks a problem done, records a score, or un-marks it.
	 *
	 * Any signed-in user may track any problem, so this checks `locals.user`, not
	 * `requireOlympiadEditor`. The max score used for validation comes from the
	 * database, never the browser. The result omits `maxScore`; the page already
	 * has it from the API. Not logged to `activity_log`, which is for content edits.
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
			// `null` tells the page to delete the key; an absent key means untracked.
			return ok('trackProblem', { key, entry: null });
		}

		if (intent !== 'save' && intent !== 'complete') {
			return actionFail(400, 'trackProblem', 'Unknown tracking action');
		}

		// `complete` ignores the score field, so a bad value can't block it.
		const parsed = parseScore(intent === 'complete' ? '' : field(data, 'score'), problem.maxScore);
		// Rejected, not clamped. `actionFail`, not `error()`, keeps the popover's input.
		if (!parsed.ok) return actionFail(400, 'trackProblem', parsed.error);

		await setProblemProgress(locals.db, locals.user.id, problem.id, parsed.value);
		const entry: ProblemProgress = { score: parsed.value };
		// Returned so the page merges it without refetching.
		return ok('trackProblem', { key, entry });
	}
};
