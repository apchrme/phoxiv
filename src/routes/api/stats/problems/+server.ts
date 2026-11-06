import { count, eq, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { problems, years } from '#lib/server/db/index.js';
import { setSharedCache } from '#lib/server/cache.js';
import type { ProblemTotals } from '#lib/types.js';

/**
 * How many problems the archive holds, overall, per topic and per olympiad: the
 * denominators of the dashboard's breakdowns. Shared-cached, so a dashboard
 * view costs no read of the whole `problems` table.
 */
export const GET: RequestHandler = async ({ locals, setHeaders }) => {
	setSharedCache(setHeaders);

	const [[total], byTopic, byOlympiad] = await Promise.all([
		locals.db.select({ n: count() }).from(problems),
		// A problem with two topics counts once under each.
		locals.db.all<{ topic: string; n: number }>(sql`
			SELECT t.value AS topic, count(*) AS n
			FROM problems p, json_each(p.topics) t
			GROUP BY t.value`),
		locals.db
			.select({ olympiadId: years.olympiadId, n: count() })
			.from(problems)
			.innerJoin(years, eq(years.id, problems.yearId))
			.groupBy(years.olympiadId)
	]);

	const body: ProblemTotals = {
		total: total.n,
		byTopic: Object.fromEntries(byTopic.map((r) => [r.topic, r.n])),
		byOlympiad: Object.fromEntries(byOlympiad.map((r) => [r.olympiadId, r.n]))
	};
	return Response.json(body);
};
