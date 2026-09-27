import { asc, eq, inArray, sql } from 'drizzle-orm';
import { fileText, olympiads, problemFiles, problems, yearFiles, years, type DB } from '../index';
import type {
	FileSearchProblem,
	FileSearchResponse,
	FileSearchResult,
	FileTextStat,
	FileTextStats
} from '$lib/types';
import {
	capExtracted,
	DEEP_SEARCH_LIMIT,
	EXTRACTOR_ENGINE,
	EXTRACTOR_VERSION,
	MAX_DEEP_QUERY_TOKENS,
	MAX_PHRASE_TOKENS,
	MAX_SUBMITTED_TEXT_CHARS,
	MIN_EXTRACTED_CHARS,
	normalizeExtracted
} from '$lib/search';
import { extensionOf, isExtractable } from '$lib/uploads';
import { olympiadUrlRange } from '$lib/server/storage';

/**
 * The full-text index over extracted file text: writing, querying, cleanup.
 *
 * Correctness does not depend on cleanup. {@link searchFiles} joins every hit's
 * url back to `year_files` / `problem_files` and drops any with no owner, so a
 * stale `file_text` row can never produce a result. That is why the table needs
 * no foreign key.
 *
 * No function here returns `file_text.text`. Only `snippet()` reads it, so the
 * corpus can't be bulk-downloaded through search.
 *
 * See docs/search.md.
 */

// ── Query sanitisation ──────────────────────────────────────────────────────

/**
 * Snippet match markers: ASCII STX and ETX, not `<mark>`. `snippet()` does not
 * escape the surrounding PDF text, so HTML markers rendered through `{@html}`
 * would be stored XSS. `normalizeExtracted` strips control characters at
 * ingest, so these can't be forged.
 */
const MARK_START = '\u0002';
const MARK_END = '\u0003';

export type SanitizedQuery = {
	/**
	 * FTS5 `MATCH` expressions, most precise first. The caller stops at the
	 * first that returns a row. Empty means nothing searchable: skip the query
	 * rather than run an empty `MATCH`.
	 */
	plans: string[];
	/**
	 * The whole normalised query for the client, phrases re-quoted, uncapped.
	 * It describes no single plan, so it never implies words were dropped.
	 */
	echo: string;
};

type Token = { text: string; phrase: boolean };

/**
 * Splits a normalised query into quoted phrases and bare words.
 *
 * An unbalanced trailing quote opens a phrase instead of being dropped, so
 * search-as-you-type doesn't go blank when the quote is typed. Words split on
 * anything that isn't a letter or digit, as unicode61 does.
 */
function tokenize(query: string): Token[] {
	const tokens: Token[] = [];
	let i = 0;
	while (i < query.length) {
		const quote = query.indexOf('"', i);
		const bare = quote === -1 ? query.slice(i) : query.slice(i, quote);
		for (const word of bare.split(/[^\p{L}\p{N}]+/u)) {
			if (word) tokens.push({ text: word, phrase: false });
		}
		if (quote === -1) break;

		const close = query.indexOf('"', quote + 1);
		const inner = close === -1 ? query.slice(quote + 1) : query.slice(quote + 1, close);
		const cleaned = inner.replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
		if (cleaned) tokens.push({ text: cleaned, phrase: true });
		if (close === -1) break;
		i = close + 1;
	}
	return tokens;
}

/**
 * Turns a user query into a ladder of FTS5 `MATCH` expressions, none of which
 * can be a syntax error.
 *
 * `MATCH` is a bound parameter, so this isn't about injection. But FTS5 parses
 * the string, and a bare `"`, `*`, `-`, `NEAR`, `OR` or `(` is a syntax error,
 * which would be a 500. So every token is double-quoted, which makes every
 * operator inert. {@link tokenize} has removed every `"`, so nothing needs
 * escaping.
 *
 * | rung | expression | built when |
 * | --- | --- | --- |
 * | 1 phrase | `"w1 w2 … wN"`, `*` on the last word | ≥2 tokens, none quoted |
 * | 2 and | `"w1" AND … AND "wN"`, `*` on the last | any token at all |
 * | 3 or | `"w1" OR … OR "wN"`, no `*` | ≥3 tokens |
 *
 * Don't collapse this into one AND expression: capped, it stops narrowing;
 * uncapped, one term lost at extraction zeroes the result. Rung 3 still ranks
 * well because bm25 favours coverage.
 *
 * Rung 1 is skipped once the user quotes something; they have said where the
 * phrase is. Its trailing `*` keeps search-as-you-type alive: `"two water
 * reserv"*` matches, `"two water reserv"` does not.
 *
 * A prefix `*` goes only on the last token (the word being typed), never on a
 * single character (`a*` scans a large slice of the index), and never on a
 * phrase the user closed. Caps keep the first N tokens, so plans stay stable as
 * the user types.
 *
 * | typed | plans |
 * | --- | --- |
 * | `mc^2 relativ` | `"mc 2 relativ"*`, `"mc" AND "2" AND "relativ"*`, `"mc" OR "2" OR "relativ"` |
 * | `"black hole" entropy` | `"black hole" AND "entropy"*` |
 * | `"black hol` | `"black hol"` |
 * | `-NEAR("a" b)` | `"near" AND "a" AND "b"`, `"near" OR "a" OR "b"` |
 * | `???` | none |
 */
export function sanitizeFtsQuery(query: string): SanitizedQuery {
	const tokens = tokenize(query);
	const echo = tokens.map((t) => (t.phrase ? `"${t.text}"` : t.text)).join(' ');

	const quoted = (t: Token) => `"${t.text}"`;
	const prefixed = (t: Token) => (!t.phrase && t.text.length > 1 ? `${quoted(t)}*` : quoted(t));

	const plans: string[] = [];

	if (tokens.length >= 2 && !tokens.some((t) => t.phrase)) {
		const words = tokens.slice(0, MAX_PHRASE_TOKENS).map((t) => t.text);
		const lastWord = words[words.length - 1];
		plans.push(`"${words.join(' ')}"${lastWord.length > 1 ? '*' : ''}`);
	}

	// With no tokens the join would be '', an empty MATCH.
	const anded = tokens.slice(0, MAX_DEEP_QUERY_TOKENS);
	const lastIndex = anded.length - 1;
	if (anded.length > 0) {
		plans.push(anded.map((t, i) => (i === lastIndex ? prefixed(t) : quoted(t))).join(' AND '));
	}

	// With two tokens this would only restate rung 2 more loosely.
	if (tokens.length >= 3) {
		plans.push(tokens.slice(0, MAX_DEEP_QUERY_TOKENS).map(quoted).join(' OR '));
	}

	// Can't fire today, but stops a future rung or cap change from running the
	// same scan twice.
	return { plans: [...new Set(plans)], echo };
}

/**
 * Splits `snippet()`'s marked output into plain text plus match offsets.
 *
 * Cleaning runs before the split, so the offsets describe the final string.
 * Offsets are UTF-16 code units because the client consumes them with `slice`;
 * hence the indexed loop, not `for…of`, which would desync on astral characters.
 */
export function splitSnippet(marked: string): { snippet: string; matches: [number, number][] } {
	const cleaned = marked
		// `normalizeExtracted`'s control strip, minus STX and ETX. (`\s` below
		// doesn't match them either.)
		// eslint-disable-next-line no-control-regex -- deliberate: this strips every control character except the two sentinels the walk below reads
		.replace(/[\u0000-\u0001\u0004-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
		.replace(/[\u00AD\u200B-\u200F\u2060\uFEFF]/g, '')
		.replace(/\s+/g, ' ')
		.trim();

	let snippet = '';
	const matches: [number, number][] = [];
	let start = -1;

	for (let i = 0; i < cleaned.length; i++) {
		const ch = cleaned[i];
		if (ch === MARK_START) {
			start = snippet.length;
			continue;
		}
		if (ch === MARK_END) {
			if (start !== -1 && snippet.length > start) matches.push([start, snippet.length]);
			start = -1;
			continue;
		}
		snippet += ch;
	}
	// An unclosed range can only be a truncated snippet; close it at the end.
	if (start !== -1 && snippet.length > start) matches.push([start, snippet.length]);

	return { snippet, matches };
}

// ── Reading: deep search ────────────────────────────────────────────────────

type FtsHit = { url: string; snippet: string };

/**
 * The only function that knows the index's shape. Its contract: a url
 * byte-identical to the file tables', best-first order, and a `LIMIT`.
 *
 * Two passes, and don't fold them into one to save a round trip:
 * - Pass 1 ranks rowids and must not select `snippet()`. On an external-content
 *   table, `snippet()` beside an unconstrained `MATCH` walks the whole content
 *   table whatever the `LIMIT` (about 20× the rows read).
 * - Pass 2 computes snippets for just those rowids, which seeks instead.
 *
 * Every eligibility filter (`status = 'ok'`, the olympiad scope) runs in pass 1,
 * before the `LIMIT`. Applied after, it would shrink the window instead of
 * narrowing it, often to nothing, and break {@link searchFiles}' `+ 1`
 * truncation check. The status join stays even though non-ok rows index as ''
 * today, so this doesn't rely on every writer nulling `text`.
 *
 * The scope is a url range (see {@link olympiadUrlRange}), not a join, because
 * it costs no extra D1 rows: the `file_text` row is already read by the status
 * join. A scoped query does walk further, one row per discarded candidate.
 *
 * Pass 2 returns rows in rowid order, so results are re-emitted in pass 1's
 * order: the array order is the rank. A row missing from pass 2 (say, after a
 * concurrent write) is dropped: fewer results, never a wrong one.
 *
 * Pass 2 binds one parameter per rowid, so raising `DEEP_SEARCH_LIMIT` past ~90
 * needs chunking against D1's 100-parameter cap.
 */
async function selectFtsHits(
	db: DB,
	match: string,
	limit: number,
	olympiadId: string | null
): Promise<FtsHit[]> {
	// `sql.empty()`, not `1 = 1`, so the unfiltered statement carries no extra
	// term.
	const scope =
		olympiadId === null
			? sql.empty()
			: (() => {
					const { lo, hi } = olympiadUrlRange(olympiadId);
					return sql` AND ft.url >= ${lo} AND ft.url < ${hi}`;
				})();

	const ranked = await db.all<{ id: number }>(sql`
		SELECT file_text_fts.rowid AS id
		FROM file_text_fts
		JOIN file_text ft ON ft.id = file_text_fts.rowid AND ft.status = 'ok'
		WHERE file_text_fts MATCH ${match}${scope}
		ORDER BY rank
		LIMIT ${limit}
	`);
	if (ranked.length === 0) return [];

	const ids = ranked.map((row) => row.id);
	// Don't add the scope here. `ids` is already filtered, and `rowid IN (…)` is
	// what lets fts5 seek. A url range could make the planner drive from
	// `file_text_url_idx` and walk the table again.
	const rows = await db.all<FtsHit & { id: number }>(sql`

		SELECT ft.id AS id,
		       ft.url AS url,
		       snippet(file_text_fts, 0, char(2), char(3), '…', 16) AS snippet
		FROM file_text_fts
		JOIN file_text ft ON ft.id = file_text_fts.rowid AND ft.status = 'ok'
		WHERE file_text_fts MATCH ${match}
		  AND file_text_fts.rowid IN (${sql.join(
				ids.map((id) => sql`${id}`),
				sql`, `
			)})
	`);

	const byId = new Map(rows.map((row) => [row.id, row]));
	return ids
		.map((id) => byId.get(id))
		.filter((row): row is FtsHit & { id: number } => row !== undefined)
		.map(({ url, snippet }) => ({ url, snippet }));
}

type Owner = Omit<FileSearchResult, 'snippet' | 'matches'>;

/**
 * Resolves matched urls to the files and olympiads that own them.
 *
 * Two parallel queries folded into a map, not a `UNION`: the problem side has
 * extra columns, and the map also collapses a multi-problem file into one hit.
 * Problem rows go first, so a url that is both problem- and year-level keeps the
 * more specific label; `ORDER BY id` makes that stable.
 *
 * One bound parameter per url, so past ~90 urls this needs chunking (D1 caps at
 * 100). The caller dedupes and truncates first.
 */
async function resolveOwners(db: DB, urls: string[]): Promise<Map<string, Owner>> {
	const [problemRows, yearRows] = await Promise.all([
		db
			.select({
				url: problemFiles.url,
				label: problemFiles.label,
				year: years.year,
				olympiadId: olympiads.id,
				olympiadName: olympiads.name,
				olympiadIcon: olympiads.icon,
				number: problems.number,
				title: problems.title
			})
			.from(problemFiles)
			.innerJoin(problems, eq(problems.id, problemFiles.problemId))
			.innerJoin(years, eq(years.id, problems.yearId))
			.innerJoin(olympiads, eq(olympiads.id, years.olympiadId))
			.where(inArray(problemFiles.url, urls))
			.orderBy(asc(problems.id))
			.all(),
		db
			.select({
				url: yearFiles.url,
				label: yearFiles.label,
				year: years.year,
				olympiadId: olympiads.id,
				olympiadName: olympiads.name,
				olympiadIcon: olympiads.icon
			})
			.from(yearFiles)
			.innerJoin(years, eq(years.id, yearFiles.yearId))
			.innerJoin(olympiads, eq(olympiads.id, years.olympiadId))
			.where(inArray(yearFiles.url, urls))
			.orderBy(asc(yearFiles.id))
			.all()
	]);

	const owners = new Map<string, Owner>();

	for (const row of problemRows) {
		let owner = owners.get(row.url);
		if (owner === undefined) {
			owner = {
				file: { label: row.label, url: row.url },
				olympiadId: row.olympiadId,
				olympiadName: row.olympiadName,
				olympiadIcon: row.olympiadIcon,
				year: row.year,
				problems: []
			};
			owners.set(row.url, owner);
		}
		const problem: FileSearchProblem = {
			number: row.number,
			...(row.title ? { title: row.title } : {})
		};
		owner.problems.push(problem);
	}

	for (const row of yearRows) {
		if (owners.has(row.url)) continue;
		owners.set(row.url, {
			file: { label: row.label, url: row.url },
			olympiadId: row.olympiadId,
			olympiadName: row.olympiadName,
			olympiadIcon: row.olympiadIcon,
			year: row.year,
			// An empty list marks a year-level file; there is no `level` field.
			problems: []
		});
	}

	return owners;
}

/**
 * Files whose extracted text matches `query`, best first.
 *
 * Walks {@link sanitizeFtsQuery}'s ladder and stops at the first rung with a
 * hit. That is the ranking, not an optimisation: a phrase hit must not be
 * diluted by a looser rung's near misses. A query that sanitises to nothing
 * costs no D1 read.
 *
 * Under an olympiad scope every rung is tried within the scope, so a scoped
 * search can reach a looser rung than the unfiltered one. That is intended;
 * don't pin it to the unfiltered search's rung.
 *
 * Fetches `DEEP_SEARCH_LIMIT + 1` so `truncated` can tell "exactly the limit"
 * from "more". That is only sound because {@link selectFtsHits} filters before
 * its `LIMIT`.
 *
 * `ORDER BY rank` scores every match whatever the `LIMIT`, so
 * `MAX_DEEP_QUERY_TOKENS` is the only bound on the bm25 scan. That is why the
 * broad OR rung runs last.
 *
 * `indexEmpty` stays global under a scope: it describes the pipeline, not the
 * query.
 *
 * No try/catch turning an FTS error into `[]`: that would park an empty body in
 * the shared cache for a day. The sanitiser is the defence.
 */
export async function searchFiles(
	db: DB,
	query: string,
	olympiadId: string | null = null
): Promise<FileSearchResponse> {
	const { plans, echo } = sanitizeFtsQuery(query);

	// Nothing searchable (e.g. `???`). No D1 read: the query, not the index, is
	// why there are no results.
	if (plans.length === 0) return { query: echo, results: [], truncated: false, indexEmpty: false };

	// `hits` ends as the last rung tried, empty only if every rung was.
	let hits: FtsHit[] = [];
	for (const match of plans) {
		hits = await selectFtsHits(db, match, DEEP_SEARCH_LIMIT + 1, olympiadId);
		if (hits.length > 0) break;
	}

	const snippetByUrl = new Map<string, string>();
	for (const hit of hits) {
		if (!snippetByUrl.has(hit.url)) snippetByUrl.set(hit.url, hit.snippet);
	}
	const ranked = [...snippetByUrl.keys()];
	const truncated = ranked.length > DEEP_SEARCH_LIMIT;
	const kept = ranked.slice(0, DEEP_SEARCH_LIMIT);

	if (kept.length === 0) {
		return { query: echo, results: [], truncated: false, indexEmpty: !(await hasFileText(db)) };
	}

	const owners = await resolveOwners(db, kept);
	const results: FileSearchResult[] = [];
	for (const url of kept) {
		const owner = owners.get(url);
		if (owner === undefined) continue;
		// The scope derives ownership from the url; resolveOwners reads it from
		// the file tables. They disagree only for rows written outside
		// `uploadFile` (hand-run SQL, rclone). Drop those.
		if (olympiadId !== null && owner.olympiadId !== olympiadId) continue;
		results.push({ ...owner, ...splitSnippet(snippetByUrl.get(url) ?? '') });
	}

	return { query: echo, results, truncated, indexEmpty: false };
}

/** Whether the index holds anything at all, for the "still indexing" empty state. */
export async function hasFileText(db: DB): Promise<boolean> {
	const row = await db
		.select({ id: fileText.id })
		.from(fileText)
		.where(eq(fileText.status, 'ok'))
		.limit(1)
		.get();
	return row !== undefined;
}

// ── Writing ─────────────────────────────────────────────────────────────────

/** Every field a write may set. `text` is the only one that is ever large. */
export type FileTextWrite = {
	url: string;
	ext: string;
	status: 'pending' | 'ok' | 'empty' | 'skipped' | 'error';
	text?: string | null;
	chars?: number;
	truncated?: boolean;
	etag?: string | null;
	bytes?: number | null;
	engine?: string;
	error?: string | null;
};

/**
 * The one writer. Upserts on `url`.
 *
 * `attempts` increments on the retryable statuses (pending, error) and resets on
 * the terminal ones, so a poison file leaves {@link selectIndexCandidates}' queue
 * after three tries.
 */
export async function writeFileText(db: DB, w: FileTextWrite): Promise<void> {
	const retryable = w.status === 'pending' || w.status === 'error';
	const shared = {
		status: w.status,
		text: w.text ?? null,
		chars: w.chars ?? 0,
		truncated: w.truncated ?? false,
		etag: w.etag ?? null,
		bytes: w.bytes ?? null,
		ext: w.ext,
		engine: w.engine ?? '',
		error: w.error ?? null,
		extractorVersion: EXTRACTOR_VERSION
	};

	await db
		.insert(fileText)
		.values({ url: w.url, ...shared, attempts: retryable ? 1 : 0 })
		.onConflictDoUpdate({
			target: fileText.url,
			set: {
				...shared,
				// In an upsert's SET, an unqualified column is the existing row's
				// value, so this really increments.
				attempts: retryable ? sql`${fileText.attempts} + 1` : 0,
				updatedAt: new Date()
			}
		})
		.run();
}

/**
 * Stores the text a contributor's browser extracted, as one upsert.
 *
 * `submitted` is client-supplied. What contains that:
 * - Only olympiad editors reach this, and they could already upload a
 *   mislabelled file.
 * - The server re-runs `normalizeExtracted`. This is the security step: it
 *   strips forged STX/ETX sentinels.
 * - A size gate well under D1's 2 MB row limit, then `TEXT_CHAR_CAP`.
 * - The text only leaves the server as a plain-text snippet, never HTML.
 *
 * | cause | row |
 * | --- | --- |
 * | ext not in `EXTRACTABLE_EXTS` | `skipped` |
 * | field absent or blank (old browser, JS off, extraction failed) | `pending` |
 * | over the size gate | `pending`, with `error` |
 * | under `MIN_EXTRACTED_CHARS` after normalising | `empty` (a scan) |
 * | otherwise | `ok` |
 *
 * Can throw on a D1 error; the upload action catches it so indexing never fails
 * an upload.
 */
export async function putFileText(
	db: DB,
	url: string,
	ext: string,
	submitted: string
): Promise<void> {
	if (!isExtractable(ext)) return writeFileText(db, { url, ext, status: 'skipped' });
	if (!submitted) return writeFileText(db, { url, ext, status: 'pending' });
	if (submitted.length > MAX_SUBMITTED_TEXT_CHARS) {
		return writeFileText(db, {
			url,
			ext,
			status: 'pending',
			error: `Submitted text too large (${submitted.length} chars)`
		});
	}

	const normalized = normalizeExtracted(submitted);
	if (normalized.length < MIN_EXTRACTED_CHARS) {
		return writeFileText(db, { url, ext, status: 'empty', engine: EXTRACTOR_ENGINE });
	}

	const { text, truncated } = capExtracted(normalized);
	await writeFileText(db, {
		url,
		ext,
		status: 'ok',
		text,
		chars: text.length,
		truncated,
		engine: EXTRACTOR_ENGINE
	});
}

// ── Cleanup ─────────────────────────────────────────────────────────────────

/**
 * Drops the row for `url`, but only if no file row still references it: two
 * labels in one parent may name the same object.
 *
 * Hygiene, not correctness: a leftover row is invisible to {@link searchFiles}.
 */
export async function deleteFileTextForUrl(db: DB, url: string): Promise<void> {
	await db.run(sql`
		DELETE FROM ${fileText} WHERE ${fileText.url} = ${url}
		  AND NOT EXISTS (SELECT 1 FROM ${yearFiles}    WHERE ${yearFiles.url} = ${url})
		  AND NOT EXISTS (SELECT 1 FROM ${problemFiles} WHERE ${problemFiles.url} = ${url})
	`);
}

/**
 * Drops the rows for a known-dead set of urls, chunked at 100 for D1's
 * bound-parameter cap. No `NOT EXISTS` guard: the R2 key layout namespaces urls
 * by olympiad, year and problem, so nothing outside the deleted year or problems
 * can share one.
 */
export async function deleteFileTextForUrls(db: DB, urls: readonly string[]): Promise<void> {
	for (let i = 0; i < urls.length; i += 100) {
		const chunk = urls.slice(i, i + 100);
		if (chunk.length > 0) await db.delete(fileText).where(inArray(fileText.url, chunk)).run();
	}
}

/** Removes every row whose url is in neither file table. Returns how many went. */
export async function pruneFileText(db: DB): Promise<number> {
	const orphans = await db.all<{ url: string }>(sql`
		SELECT ${fileText.url} AS url FROM ${fileText}
		WHERE NOT EXISTS (SELECT 1 FROM ${yearFiles}    WHERE ${yearFiles.url}    = ${fileText.url})
		  AND NOT EXISTS (SELECT 1 FROM ${problemFiles} WHERE ${problemFiles.url} = ${fileText.url})
	`);
	await deleteFileTextForUrls(
		db,
		orphans.map((o) => o.url)
	);
	return orphans.length;
}

// ── Backfill and reporting ──────────────────────────────────────────────────

/**
 * Counts by status, plus recent failures. The type lives in `$lib/types.ts`
 * because the admin panel fetches it client-side.
 *
 * Expensive (thousands of D1 rows), so `/admin` fetches it on demand via
 * `admin/index-stats/+server.ts` rather than on page load.
 */
export async function getFileTextStats(db: DB): Promise<FileTextStats> {
	const [counts, failures, indexed] = await Promise.all([
		db.all<FileTextStat>(sql`
			SELECT ${fileText.status} AS status, count(*) AS count
			FROM ${fileText} GROUP BY ${fileText.status} ORDER BY ${fileText.status}
		`),
		db
			.select({
				url: fileText.url,
				status: fileText.status,
				error: fileText.error,
				attempts: fileText.attempts
			})
			.from(fileText)
			.where(eq(fileText.status, 'error'))
			.orderBy(asc(fileText.url))
			.limit(50)
			.all(),
		db.get<{ n: number }>(sql`
			SELECT count(*) AS n FROM (
				SELECT url FROM ${yearFiles} UNION SELECT url FROM ${problemFiles}
			)
		`)
	]);
	return { counts, failures, indexed: indexed?.n ?? 0 };
}

/** Per-file extraction status for the year editor's badges, keyed by url. Never returns `text`. */
export async function getFileTextStatuses(
	db: DB,
	urls: readonly string[]
): Promise<Record<string, string>> {
	if (urls.length === 0) return {};
	const out: Record<string, string> = {};
	for (let i = 0; i < urls.length; i += 100) {
		const chunk = urls.slice(i, i + 100);
		const rows = await db
			.select({ url: fileText.url, status: fileText.status })
			.from(fileText)
			.where(inArray(fileText.url, chunk))
			.all();
		for (const row of rows) out[row.url] = row.status;
	}
	return out;
}

export type IndexCandidate = { url: string; ext: string };

/**
 * The backfill's work queue, derived from the file tables rather than stored.
 * Processing a candidate writes its row, which removes it from the set, so the
 * sweep is idempotent and resumable, and files loaded out of band (rclone) are
 * picked up automatically.
 *
 * `withCount` is opt-in because the count scans the whole file union (thousands
 * of D1 rows). The CLI asks for it once per sweep.
 *
 * The `skipped` clause lets a wider extractor pick up what a narrower one
 * passed on: the local script can read `.docx`/`.xlsx`, which the browser skips.
 */
export async function selectIndexCandidates(
	db: DB,
	opts: { extractorVersion?: number; exts: readonly string[]; limit: number; withCount?: boolean }
): Promise<{ candidates: IndexCandidate[]; remaining?: number }> {
	const version = opts.extractorVersion ?? EXTRACTOR_VERSION;
	const exts = opts.exts.length > 0 ? opts.exts : [''];

	const where = sql`
		WITH files AS (
			SELECT url FROM ${yearFiles}
			UNION                       -- UNION, not UNION ALL: dedupes a shared object
			SELECT url FROM ${problemFiles}
		)
		SELECT f.url AS url FROM files f
		LEFT JOIN ${fileText} t ON t.url = f.url
		WHERE t.id IS NULL                                              -- never seen
		   OR (t.status IN ('pending','error') AND t.attempts < 3)      -- retryable
		   OR t.extractor_version < ${version}                          -- pipeline moved on
		   OR (t.status = 'skipped' AND t.ext IN ${exts})               -- a wider extractor
	`;

	// `Promise.all` passes `undefined` straight through, so the two queries stay
	// parallel when the count is wanted.
	const [rows, total] = await Promise.all([
		db.all<{ url: string }>(sql`${where} ORDER BY f.url LIMIT ${opts.limit}`),
		opts.withCount ? db.get<{ n: number }>(sql`SELECT count(*) AS n FROM (${where})`) : undefined
	]);

	const candidates = rows.map((r) => ({ url: r.url, ext: extensionOf(r.url) }));

	// Omit `remaining` when not asked for: "didn't count" is not "none left".
	return opts.withCount ? { candidates, remaining: total?.n ?? candidates.length } : { candidates };
}

/**
 * Re-creates the FTS5 table and triggers if missing, then rebuilds the index
 * from `file_text` (external content, so no re-extraction). Recovers from
 * anything that dropped them, such as a stray `db:push`.
 */
export async function ensureFileTextIndex(db: DB): Promise<void> {
	await db.run(sql`
		CREATE VIRTUAL TABLE IF NOT EXISTS file_text_fts USING fts5(
			text, content='file_text', content_rowid='id',
			tokenize='unicode61 remove_diacritics 2', prefix='2 3'
		)
	`);
	await db.run(sql`
		CREATE TRIGGER IF NOT EXISTS file_text_fts_ai AFTER INSERT ON file_text FOR EACH ROW BEGIN
			INSERT INTO file_text_fts(rowid, text) VALUES (new.id, coalesce(new.text, ''));
		END
	`);
	await db.run(sql`
		CREATE TRIGGER IF NOT EXISTS file_text_fts_ad AFTER DELETE ON file_text FOR EACH ROW BEGIN
			INSERT INTO file_text_fts(file_text_fts, rowid, text) VALUES ('delete', old.id, coalesce(old.text, ''));
		END
	`);
	await db.run(sql`
		CREATE TRIGGER IF NOT EXISTS file_text_fts_au AFTER UPDATE ON file_text FOR EACH ROW BEGIN
			INSERT INTO file_text_fts(file_text_fts, rowid, text) VALUES ('delete', old.id, coalesce(old.text, ''));
			INSERT INTO file_text_fts(rowid, text) VALUES (new.id, coalesce(new.text, ''));
		END
	`);
	await db.run(sql`INSERT INTO file_text_fts(file_text_fts) VALUES('rebuild')`);
}

/**
 * Merges the index's b-tree segments; worth running after a large backfill.
 * `merge` rather than `optimize`, which is one unbounded statement and can hit
 * D1's 30-second limit. `merge` is bounded and can be re-run.
 */
export async function optimizeFileTextIndex(db: DB): Promise<void> {
	await db.run(sql`INSERT INTO file_text_fts(file_text_fts, rank) VALUES('merge', 500)`);
}
