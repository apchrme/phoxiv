import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { olympiads, type DB } from '#lib/server/db/index.js';
import { requireAdmin } from '#lib/server/guard.js';
import { logActivity } from '#lib/server/activity-log.js';
import { listOlympiadOptions } from '#lib/server/db/queries/olympiads.js';
import { actionFail, field, fieldList, ok, type Validated } from '#lib/server/forms.js';
import {
	countHolders,
	deleteBadge,
	getBadge,
	getManualProblems,
	listHolders,
	resolveProblemRefs,
	saveBadge,
	type BadgeInput
} from '#lib/server/db/queries/badges.js';
import {
	BADGE_DESCRIPTION_MAX as DESCRIPTION_MAX,
	BADGE_NAME_MAX as NAME_MAX,
	isBadgeColor,
	isBadgeIcon,
	isBadgeScope,
	type ProblemRef
} from '#lib/badges.js';
import { normalizeTopic } from '#lib/utils/topics.js';
import { PROBLEM_TOPICS } from '#lib/types.js';

/**
 * The badge editor. `/admin/badges/new` creates one; `/admin/badges/<id>` edits
 * it. One route, so the form and its `./$types` live in one folder.
 *
 * The admin layout guards the load, but each action calls `requireAdmin` again:
 * a forged POST never runs the layout (docs/auth.md).
 */

/** A sanity bound, not a design limit: no badge needs more completions. */
const REQUIRED_MAX = 10000;

/**
 * The route param as a badge id, `null` for `new`, or `'invalid'`. The load
 * turns `'invalid'` into a 404 page and the actions into `actionFail`, since
 * `error()` in an action would replace the page (CLAUDE.md, rule 6).
 */
function parseId(raw: string): number | null | 'invalid' {
	if (raw === 'new') return null;
	const id = Number(raw);
	return Number.isInteger(id) && id > 0 ? id : 'invalid';
}

export const load: PageServerLoad = async ({ params, locals }) => {
	const { db } = requireAdmin(locals);
	const id = parseId(params.id);
	if (id === 'invalid') error(404, 'Badge not found');

	const [badge, manualProblems, olympiadOptions, holderList] = await Promise.all([
		id === null ? null : getBadge(db, id),
		id === null ? [] : getManualProblems(db, id),
		listOlympiadOptions(db),
		// Who holds it, with emails: admin only, which the layout and
		// `requireAdmin` above guarantee (docs/auth.md). One row per holder.
		id === null ? [] : listHolders(db, id)
	]);
	if (id !== null && !badge) error(404, 'Badge not found');

	return {
		badge: badge ?? null,
		manualProblems,
		olympiads: olympiadOptions,
		holderList
	};
};

/** A percentage bound: blank is open (`null`), otherwise 0 to 100. */
function parsePct(raw: string, label: string): Validated<number | null> {
	if (raw === '') return { ok: true, value: null };
	const value = Number(raw);
	if (!Number.isFinite(value) || value < 0 || value > 100) {
		return { ok: false, error: `${label} must be a percentage from 0 to 100` };
	}
	return { ok: true, value };
}

/** The `problems` field: a JSON array of `{ olympiadId, year, number }`. */
function parseProblemRefs(raw: string): Validated<ProblemRef[]> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw || '[]');
	} catch {
		return { ok: false, error: 'The problem list could not be read' };
	}
	if (!Array.isArray(parsed)) return { ok: false, error: 'The problem list could not be read' };
	const refs: ProblemRef[] = [];
	for (const item of parsed) {
		if (
			typeof item !== 'object' ||
			item === null ||
			typeof item.olympiadId !== 'string' ||
			!Number.isInteger(item.year) ||
			typeof item.number !== 'string'
		) {
			return { ok: false, error: 'The problem list could not be read' };
		}
		refs.push({ olympiadId: item.olympiadId, year: item.year, number: item.number });
	}
	return { ok: true, value: refs };
}

/**
 * Every field of the form, checked. Topics are rejected rather than dropped
 * when unknown, so a typo can't silently widen a filter badge to every topic.
 */
async function parseBadgeForm(db: DB, data: FormData): Promise<Validated<BadgeInput>> {
	const name = field(data, 'name');
	if (!name) return { ok: false, error: 'Name is required' };
	if (name.length > NAME_MAX)
		return { ok: false, error: `Name must be at most ${NAME_MAX} characters` };

	const description = field(data, 'description');
	if (description.length > DESCRIPTION_MAX) {
		return { ok: false, error: `Description must be at most ${DESCRIPTION_MAX} characters` };
	}

	const icon = field(data, 'icon');
	if (!isBadgeIcon(icon)) return { ok: false, error: 'Pick an icon' };
	const color = field(data, 'color');
	if (!isBadgeColor(color)) return { ok: false, error: 'Pick a colour' };

	const requiredRaw = field(data, 'requiredCount');
	const requiredCount = Number(requiredRaw);
	if (!requiredRaw || !Number.isInteger(requiredCount) || requiredCount < 1) {
		return { ok: false, error: 'Problems required must be a whole number, at least 1' };
	}
	if (requiredCount > REQUIRED_MAX) {
		return { ok: false, error: `Problems required must be at most ${REQUIRED_MAX}` };
	}

	const min = parsePct(field(data, 'scoreMinPct'), 'Minimum score');
	if (!min.ok) return min;
	const max = parsePct(field(data, 'scoreMaxPct'), 'Maximum score');
	if (!max.ok) return max;
	if (min.value !== null && max.value !== null && min.value > max.value) {
		return { ok: false, error: 'Minimum score must not be above the maximum' };
	}

	const scope = field(data, 'scope');
	if (!isBadgeScope(scope)) return { ok: false, error: 'Choose which problems count' };

	let topics: (typeof PROBLEM_TOPICS)[number][] = [];
	let olympiadIds: string[] = [];
	if (scope === 'filter') {
		let rawTopics: unknown;
		try {
			rawTopics = JSON.parse(field(data, 'topics') || '[]');
		} catch {
			rawTopics = null;
		}
		if (!Array.isArray(rawTopics)) return { ok: false, error: 'The topics could not be read' };
		const found = new Set<string>();
		for (const raw of rawTopics) {
			const topic = typeof raw === 'string' ? normalizeTopic(raw) : null;
			if (!topic) return { ok: false, error: `Unknown topic: ${String(raw)}` };
			found.add(topic);
		}
		topics = PROBLEM_TOPICS.filter((t) => found.has(t));

		olympiadIds = [...new Set(fieldList(data, 'olympiadId').filter(Boolean))];
		if (olympiadIds.length > 0) {
			const known = new Set(
				(await db.select({ id: olympiads.id }).from(olympiads).all()).map((o) => o.id)
			);
			const unknown = olympiadIds.find((id) => !known.has(id));
			if (unknown) return { ok: false, error: `Unknown olympiad: ${unknown}` };
		}
		if (topics.length === 0 && olympiadIds.length === 0) {
			return {
				ok: false,
				error: 'Pick at least one topic or olympiad, or choose "Every problem"'
			};
		}
	}

	return {
		ok: true,
		value: {
			name,
			description,
			icon,
			color,
			requiredCount,
			scoreMinPct: min.value,
			scoreMaxPct: max.value,
			scope,
			topics,
			olympiadIds,
			// The switch's hidden input is present only when it is on.
			requirementHidden: field(data, 'requirementHidden') === 'on'
		}
	};
}

export const actions: Actions = {
	/**
	 * Creates or updates the badge, then re-evaluates it for every user. That
	 * recompute scans all progress rows (docs/data-model.md), which is why it
	 * runs here and nowhere on a page view.
	 */
	save: async ({ request, params, locals }) => {
		const { db, user: actor } = requireAdmin(locals);
		const id = parseId(params.id);
		if (id === 'invalid') return actionFail(404, 'save', 'Badge not found');
		const data = await request.formData();

		const parsed = await parseBadgeForm(db, data);
		if (!parsed.ok) return actionFail(400, 'save', parsed.error);
		const input = parsed.value;

		let problemIds: number[] = [];
		if (input.scope === 'manual') {
			const refs = parseProblemRefs(field(data, 'problems'));
			if (!refs.ok) return actionFail(400, 'save', refs.error);
			const resolved = await resolveProblemRefs(db, refs.value);
			if (resolved.missing.length > 0) {
				const names = resolved.missing
					.slice(0, 3)
					.map((r) => `${r.olympiadId} ${r.year} ${r.number}`)
					.join(', ');
				return actionFail(400, 'save', `These problems no longer exist: ${names}`);
			}
			problemIds = resolved.ids;
			if (problemIds.length < input.requiredCount) {
				return actionFail(
					400,
					'save',
					`Select at least ${input.requiredCount} problems, or lower the number required`
				);
			}
		}

		// Saves and re-evaluates the badge for every user in one transaction;
		// `undefined` means the badge no longer exists.
		const badge = await saveBadge(db, id, input, problemIds);
		if (!badge) return actionFail(404, 'save', 'Badge not found');
		await logActivity(db, actor, id === null ? 'create_badge' : 'update_badge', badge.name);

		return ok('save', {
			id: badge.id,
			created: id === null,
			holders: await countHolders(db, badge.id)
		});
	},

	/** Deletes the badge; its problem links and awards cascade. */
	delete: async ({ params, locals }) => {
		const { db, user: actor } = requireAdmin(locals);
		const id = parseId(params.id);
		if (id === 'invalid') return actionFail(404, 'delete', 'Badge not found');
		if (id === null) return actionFail(400, 'delete', 'Nothing to delete');

		const removed = await deleteBadge(db, id);
		if (!removed) return actionFail(404, 'delete', 'Badge not found');
		await logActivity(db, actor, 'delete_badge', removed.name);

		redirect(303, '/admin/badges');
	}
};
