import { and, count, eq, inArray, isNotNull, isNull, or } from 'drizzle-orm';
import { problemFiles, problems, user, yearFiles, years, type DB } from '../index';
import type { Contributor, TeamMember } from '#lib/types.js';

/*
 * Upload counts per user, for the olympiad page's contributors list and `/team`.
 * Both back shared-cached `/api/*` endpoints, so they return only what is public
 * already: display name, avatar and a count. Never the email or the user id.
 *
 * A file counts for whoever `uploaded_by` names. Unattributed files (NULL) count
 * for nobody. Each file table is counted by its own GROUP BY and the two are
 * summed here, which keeps both queries on the `uploaded_by` indexes.
 */

/** Banned users stay credited on their files but are never listed publicly. */
const notBanned = or(isNull(user.banned), eq(user.banned, false));

type CountRow = { id: string; name: string; image: string | null; uploads: number };

/** Sums the two tables' counts per user. */
function sumCounts(...groups: CountRow[][]): Map<string, CountRow> {
	const byId = new Map<string, CountRow>();
	for (const row of groups.flat()) {
		const seen = byId.get(row.id);
		if (seen) seen.uploads += row.uploads;
		else byId.set(row.id, { ...row });
	}
	return byId;
}

/** Most uploads first; ties alphabetical, so the order is stable between visits. */
function byUploads(a: { uploads: number; name: string }, b: { uploads: number; name: string }) {
	return b.uploads - a.uploads || a.name.localeCompare(b.name);
}

/**
 * Everyone who uploaded at least one of this olympiad's files, whatever their
 * role now. Backs `GET /api/olympiads/[olympiad]/contributors`.
 */
export async function getOlympiadContributors(db: DB, olympiadId: string): Promise<Contributor[]> {
	const selection = { id: user.id, name: user.name, image: user.image, uploads: count() };
	const [yearCounts, problemCounts] = await Promise.all([
		db
			.select(selection)
			.from(yearFiles)
			.innerJoin(years, eq(years.id, yearFiles.yearId))
			.innerJoin(user, eq(user.id, yearFiles.uploadedBy))
			.where(and(eq(years.olympiadId, olympiadId), notBanned))
			.groupBy(user.id)
			.all(),
		db
			.select(selection)
			.from(problemFiles)
			.innerJoin(problems, eq(problems.id, problemFiles.problemId))
			.innerJoin(years, eq(years.id, problems.yearId))
			.innerJoin(user, eq(user.id, problemFiles.uploadedBy))
			.where(and(eq(years.olympiadId, olympiadId), notBanned))
			.groupBy(user.id)
			.all()
	]);

	return [...sumCounts(yearCounts, problemCounts).values()]
		.sort(byUploads)
		.map(({ name, image, uploads }) => ({ name, image, uploads }));
}

/**
 * Every admin and contributor, including those with no uploads yet. Backs
 * `GET /api/team`. Counts span the whole archive.
 */
export async function getTeam(db: DB): Promise<TeamMember[]> {
	const [members, yearCounts, problemCounts] = await Promise.all([
		db
			.select({ id: user.id, name: user.name, image: user.image, role: user.role })
			.from(user)
			.where(and(inArray(user.role, ['admin', 'contributor']), notBanned))
			.all(),
		db
			.select({ id: yearFiles.uploadedBy, uploads: count() })
			.from(yearFiles)
			.where(isNotNull(yearFiles.uploadedBy))
			.groupBy(yearFiles.uploadedBy)
			.all(),
		db
			.select({ id: problemFiles.uploadedBy, uploads: count() })
			.from(problemFiles)
			.where(isNotNull(problemFiles.uploadedBy))
			.groupBy(problemFiles.uploadedBy)
			.all()
	]);

	const uploadsById = new Map<string, number>();
	for (const { id, uploads } of [...yearCounts, ...problemCounts]) {
		if (id) uploadsById.set(id, (uploadsById.get(id) ?? 0) + uploads);
	}

	return members
		.map(({ id, name, image, role }) => ({
			name,
			image,
			// The `where` admits only these two.
			role: role === 'admin' ? ('admin' as const) : ('contributor' as const),
			uploads: uploadsById.get(id) ?? 0
		}))
		.sort(byUploads);
}
