import { asc, eq, inArray, sql } from 'drizzle-orm';
import { fileText, olympiads, problemFiles, problems, yearFiles, years, type DB } from '../index';
import type { FileSearchProblem, FileSearchResponse, FileSearchResult } from '$lib/types';
import {
	capExtracted,
	DEEP_SEARCH_LIMIT,
	EXTRACTOR_ENGINE,
	EXTRACTOR_VERSION,
	MAX_DEEP_QUERY_TOKENS,
	MAX_SUBMITTED_TEXT_CHARS,
	MIN_EXTRACTED_CHARS,
	normalizeExtracted
} from '$lib/search';
import { extensionOf, isExtractable } from '$lib/uploads';

/**
 * The full-text index: writing it, querying it, and keeping it tidy.
 *
 * A module of its own rather than an extension of `content.ts`, which describes
 * itself as "the joined reads that assemble years, problems and their files" —
 * tree assembly for the frozen public shapes and the editor. A text index with a
 * rank and an excerpt is a different concern, and it is also where the query
 * layer's **first raw `sql`** lives, which is worth isolating.
 *
 * # Correctness does not depend on cleanup
 *
 * {@link searchFiles} resolves every hit's url **back** to `year_files` /
 * `problem_files` and drops anything with no owning row. D1 is the authority on
 * what exists, so a `file_text` row whose object is gone is *unreachable* — it
 * can never produce a result, only waste bytes. That is the property that makes
 * everything else here forgiving, and it is why the table needs no foreign key.
 *
 * Four things keep the pieces in step, and it is worth saying so in one place:
 * the SQL **triggers** keep `file_text_fts` in step with `file_text` for every
 * writer, including a hand-run `wrangler d1 execute`; `extractor_version` keeps
 * `file_text` in step with the pipeline; `etag`/`bytes` keep it in step with R2;
 * and the **url join in the read query** keeps results in step with the file
 * tables with no cleanup dependency at all.
 *
 * # The text column never leaves
 *
 * No function here returns `file_text.text`. Only `snippet()` reads it, inside
 * the FTS5 query, and what travels is a bounded excerpt. Keeping that true is
 * what stops the corpus from becoming bulk-downloadable, which is a
 * copyright-adjacent question for third-party papers.
 */

// ── Query sanitisation ──────────────────────────────────────────────────────

/**
 * The snippet sentinels: ASCII STX and ETX.
 *
 * Not `<mark>`. FTS5's `snippet()` wraps matches in markers of your choosing but
 * **does not escape the surrounding text**, and that text is extracted from
 * contributor-uploaded PDFs — so marking with HTML and rendering it through
 * `{@html}` would be stored XSS on our own origin. Control characters cannot
 * occur in stored text, because `normalizeExtracted` strips them at ingest on
 * every path, so they are unforgeable.
 */
const MARK_START = '\u0002';
const MARK_END = '\u0003';

export type SanitizedQuery = {
	/**
	 * The FTS5 `MATCH` expression. **Empty means "nothing searchable"** — the
	 * caller must then skip the query rather than run an empty `MATCH`.
	 */
	match: string;
	/** The query echoed to the client: normalised, capped, phrases re-quoted. */
	echo: string;
	/** The bare terms, for JS-side use by a caller that wants them. */
	terms: string[];
};

type Token = { text: string; phrase: boolean };

/**
 * Splits a normalised query into phrases and bare words.
 *
 * Phrases first: everything between a pair of `"` is one token. An **unbalanced
 * trailing quote opens a phrase** rather than being dropped — the user is
 * mid-phrase, and search-as-you-type must not go blank on the keystroke that
 * types the quote.
 *
 * Bare words split on anything that is not a letter or a digit, which is what
 * `unicode61` does anyway, so `e=mc^2` yields `e`, `mc`, `2` here exactly as it
 * does in the index.
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
 * A user's query, turned into an FTS5 `MATCH` expression that cannot be a syntax
 * error.
 *
 * Nothing user-typed reaches `MATCH` as SQL — the expression is a bound
 * parameter — so this is not an injection risk. It is a **grammar** risk: FTS5
 * parses the bound string, and a bare `"`, `*`, `-`, `NEAR`, `OR` or `(` is
 * `SQLITE_ERROR: fts5: syntax error`, which is a 500 on ordinary input like
 * `e = mc^2` or `T1 - solutions`.
 *
 * The defence is one line long: **every token becomes a double-quoted FTS5
 * string**, which makes every operator inert, because FTS5 only recognises its
 * keywords unquoted. No escaping is needed inside the quotes because
 * {@link tokenize} has already dropped everything that is not a letter, a digit
 * or (inside a phrase) a space — a `"` cannot survive into a token.
 *
 * | typed | `match` |
 * | --- | --- |
 * | `gravitation` | `"gravitation"*` |
 * | `mc^2 relativ` | `"mc" AND "2" AND "relativ"*` |
 * | `"black hole" entropy` | `"black hole" AND "entropy"*` |
 * | `"black hol` | `"black hol"` — open phrase, not extended |
 * | `foo OR bar` | `"foo" AND "or" AND "bar"*` |
 * | `-NEAR("a" b)` | `"near" AND "a" AND "b"*` |
 * | `???` | `''` → skip the query, empty results |
 *
 * `AND` is written explicitly even though FTS5's implicit operator between two
 * strings is already AND, so the expression does not depend on that default.
 *
 * The cap keeps the **first** `MAX_DEEP_QUERY_TOKENS`, not the last, so the
 * expression stays stable as the user keeps typing. The trailing prefix `*` goes
 * on the last **bare word** only: not on a closed phrase, and not on a single
 * character, since `a*` probes a large slice of the index for almost no signal.
 */
export function sanitizeFtsQuery(query: string): SanitizedQuery {
	const tokens = tokenize(query).slice(0, MAX_DEEP_QUERY_TOKENS);
	const last = tokens.length - 1;

	const match = tokens
		.map((t, i) => {
			const quoted = `"${t.text}"`;
			return i === last && !t.phrase && t.text.length > 1 ? `${quoted}*` : quoted;
		})
		.join(' AND ');

	return {
		match,
		echo: tokens.map((t) => (t.phrase ? `"${t.text}"` : t.text)).join(' '),
		terms: tokens.map((t) => t.text)
	};
}

/**
 * Splits `snippet()`'s marked output into plain text plus match offsets.
 *
 * The controls are scrubbed and the whitespace collapsed **before** the split,
 * so the offsets already describe the exact string the client will slice.
 * Neither pass can touch the markers: STX and ETX are excluded from the control
 * range below, and JS `\s` does not match them.
 *
 * The walk is an **indexed loop, not `for…of`**. The offsets are UTF-16
 * code-unit offsets, because `String.prototype.slice` is what consumes them on
 * the other side; iterating by code point would desync them on any astral
 * character, and extracted PDF text is full of surprises.
 */
export function splitSnippet(marked: string): { snippet: string; matches: [number, number][] } {
	const cleaned = marked
		// C0/C1 controls **except** STX, ETX and \t \n \r — the same strip
		// `normalizeExtracted` applies, minus the two sentinels this is here to read.
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
 * **The only function in the codebase that knows the index's shape.**
 *
 * Everything above consumes `FtsHit[]`, so swapping FTS5 for something else is a
 * change to this function and nothing more. The contract is three things: a
 * `url` byte-identical to the file tables', a best-first ordering, and a `LIMIT`.
 *
 * The CTE is not decoration. The `LIMIT` must be applied **before** the join, or
 * a broad query re-reads hundreds of 40 kB texts to build snippets it will then
 * throw away.
 *
 * `rank` is carried out of the CTE as `score` and used as the outer `ORDER BY`.
 * Ordering the outer query by anything else — `h.id`, say — silently discards
 * bm25 and returns insertion order, which would quietly falsify the "the array
 * order IS the rank" contract the response shape rests on.
 */
async function selectFtsHits(db: DB, match: string, limit: number): Promise<FtsHit[]> {
	return db.all<FtsHit>(sql`
		WITH hits AS (
			SELECT rowid AS id,
			       rank AS score,
			       snippet(file_text_fts, 0, char(2), char(3), '…', 16) AS snippet
			FROM file_text_fts
			WHERE file_text_fts MATCH ${match}
			ORDER BY rank
			LIMIT ${limit}
		)
		SELECT ft.url AS url, h.snippet AS snippet
		FROM hits h
		JOIN file_text ft ON ft.id = h.id AND ft.status = 'ok'
		ORDER BY h.score
	`);
}

type Owner = Omit<FileSearchResult, 'snippet' | 'matches'>;

/**
 * Resolves matched urls to the files and olympiads that own them.
 *
 * **Two parallel queries folded into a map, not a `UNION`.** The two sides
 * genuinely differ in shape — the problem side carries `problems.number` and
 * `title` — so a union would need null padding plus a discriminator, and
 * Drizzle's `unionAll` requires identical projections anyway. `Promise.all` runs
 * them concurrently, and the `Map` is needed regardless, to collapse a
 * multi-problem file into one hit.
 *
 * Problem rows are folded **first**, so a url that is somehow both problem- and
 * year-level keeps the more specific label. `ORDER BY problems.id` /
 * `yearFiles.id` fixes each hit's `problems` order and makes "first wins" stable.
 *
 * Each query binds one parameter per url. At `DEEP_SEARCH_LIMIT` = 20 that is
 * nowhere near D1's 100-parameter cap — but **raising the limit past ~90 means
 * chunking**, which is why the caller must dedupe and truncate *before* calling
 * and never pass the over-fetched list.
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
			// Empty *is* the year-level flag. There is no `level` field.
			problems: []
		});
	}

	return owners;
}

/**
 * Files whose extracted text matches `query`, best first.
 *
 * Three D1 queries on a hit: the index, then the two owner reads in parallel. A
 * query that sanitises to nothing costs **no D1 read at all**.
 *
 * The index is over-fetched ×3 and then deduped by url in rank order, because
 * the row count is not the hit count: a file attached to two problems fans out
 * to two rows, and a file whose url has been orphaned yields zero.
 *
 * A url in the index with **no owning row is dropped, not rendered**: D1 is the
 * authority on what exists, so a stale index degrades to fewer results rather
 * than to a dead link.
 *
 * There is deliberately **no `try/catch` swallowing an FTS error to `[]`** — that
 * would put an empty body for a query that should work into the shared cache for
 * a day. The sanitiser is the defence; observability is where a bug should
 * surface.
 */
export async function searchFiles(db: DB, query: string): Promise<FileSearchResponse> {
	const { match, echo } = sanitizeFtsQuery(query);

	// Nothing searchable — `???`, or punctuation only. No D1 read: the reason
	// there are no results is the query, not the index, so `indexEmpty` stays
	// false without asking.
	if (!match) return { query: echo, results: [], truncated: false, indexEmpty: false };

	const hits = await selectFtsHits(db, match, DEEP_SEARCH_LIMIT * 3);

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
 * The one writer. Upserts on `url` and **never throws** — see the callers.
 *
 * `attempts` increments for the two retryable statuses and resets for the three
 * terminal ones, which is what bounds a poison file: after three goes it drops
 * out of {@link selectIndexCandidates}' set and stops blocking the queue.
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
				// Unqualified in SQLite's upsert SET, a column reference is the
				// *existing* row's value, so this really does increment rather than
				// re-read the value being inserted.
				attempts: retryable ? sql`${fileText.attempts} + 1` : 0,
				updatedAt: new Date()
			}
		})
		.run();
}

/**
 * Queues a file for extraction, **resetting** any state a previous object under
 * the same url left behind.
 *
 * The one case where cleanup would otherwise matter is delete-then-re-upload
 * with the same label and extension: identical key, identical url, same identity
 * but different bytes. This upsert is what handles it — not the cleanup running.
 */
export async function enqueueFileText(db: DB, url: string, ext: string): Promise<void> {
	await writeFileText(db, { url, ext, status: 'pending' });
}

/**
 * Stores the text a contributor's browser extracted, as one upsert.
 *
 * **`submitted` is client-supplied, and that is the one real cost of extracting
 * in the browser.** Four things contain it, and they belong together:
 *
 * 1. **The trust boundary is unchanged.** Only `requireOlympiadEditor` reaches
 *    the action that calls this, and a contributor who wanted to poison search
 *    text could already upload a mislabelled file. This widens an existing
 *    capability rather than granting a new one — a different thing, and worth
 *    saying plainly.
 * 2. **The server re-runs `normalizeExtracted`.** Not tidiness: this is the
 *    security step. It is what strips the U+0002/U+0003 snippet sentinels so
 *    they cannot be forged into a result row's `matches`, and what applies
 *    `TEXT_CHAR_CAP`.
 * 3. **A hard size gate before the write**, well under D1's 2 MB row limit.
 *    Anything larger lands `pending` for the backfill sweep instead of stored.
 * 4. **The text never becomes HTML.** It leaves the server only as a bounded
 *    snippet, as plain text plus offsets — which is what keeps this from being an
 *    XSS question at all.
 *
 * Never throws, and never fails an upload:
 *
 * | cause | row |
 * | --- | --- |
 * | ext not in `EXTRACTABLE_EXTS` | `skipped` |
 * | field absent or blank — old browser, JS off, extraction failed | `pending` |
 * | over the size gate | `pending`, with `error` recorded |
 * | normalises to under `MIN_EXTRACTED_CHARS` | `empty` — a scan |
 * | otherwise | `ok` + text, chars, truncated, engine, version |
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
 * Drops the row for `url`, but **only if no file row still references it**.
 *
 * Two labels in one parent may legitimately name one object, so a delete of one
 * of them must not take the other's text away. Both subqueries are index seeks,
 * thanks to `year_files_url_idx` and `problem_files_url_idx`.
 *
 * Hygiene, not correctness: a row left behind is invisible, because
 * {@link searchFiles} joins back to the file tables.
 */
export async function deleteFileTextForUrl(db: DB, url: string): Promise<void> {
	await db.run(sql`
		DELETE FROM ${fileText} WHERE ${fileText.url} = ${url}
		  AND NOT EXISTS (SELECT 1 FROM ${yearFiles}    WHERE ${yearFiles.url} = ${url})
		  AND NOT EXISTS (SELECT 1 FROM ${problemFiles} WHERE ${problemFiles.url} = ${url})
	`);
}

/**
 * Drops the rows for a known-dead set of urls.
 *
 * **Chunked at 100** for D1's bound-parameter cap. No `NOT EXISTS` guard is
 * needed at the two call sites: the R2 key layout namespaces urls by olympiad,
 * year and problem number, so nothing outside the year or the problems being
 * deleted can share one.
 */
export async function deleteFileTextForUrls(db: DB, urls: readonly string[]): Promise<void> {
	for (let i = 0; i < urls.length; i += 100) {
		const chunk = urls.slice(i, i + 100);
		if (chunk.length > 0) await db.delete(fileText).where(inArray(fileText.url, chunk)).run();
	}
}

/**
 * Removes every row whose url no longer appears in either file table.
 *
 * The admin panel's `prune`. Returns how many went, so the button can say.
 */
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

/** One row of the admin panel's status breakdown. */
export type FileTextStat = { status: string; count: number };

/** Counts by status, plus the failures worth showing. */
export async function getFileTextStats(db: DB): Promise<{
	counts: FileTextStat[];
	failures: { url: string; status: string; error: string | null; attempts: number }[];
	indexed: number;
}> {
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

/**
 * A per-file extraction status for the year editor's quiet badges.
 *
 * Keyed by url, and deliberately does not return `text`. `/contribute` is
 * uncached, so this is free.
 */
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
 * The backfill's work queue, **derived rather than stored**.
 *
 * No queue table and no cursor: processing a candidate writes its row, which
 * removes it from the set, so idempotency and resumability are free. Because the
 * candidate set *is* the file tables, files loaded out of band by rclone — where
 * the D1 rows are written independently, see `docs/deployment.md` — are picked up
 * automatically; an event-driven queue would miss them entirely.
 *
 * `ORDER BY url` makes batch boundaries reproducible when debugging.
 *
 * The `status = 'skipped'` clause is what lets a *wider* extractor pick up what a
 * narrower one passed on. The browser skips `.docx`/`.xlsx`; the local script can
 * read them, so it passes its own extension list here and those rows re-enter the
 * queue for it alone. A `.zip` is in nobody's list and therefore converges to
 * `skipped` forever, which is the point.
 */
export async function selectIndexCandidates(
	db: DB,
	opts: { extractorVersion?: number; exts: readonly string[]; limit: number }
): Promise<{ candidates: IndexCandidate[]; remaining: number }> {
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

	const [rows, total] = await Promise.all([
		db.all<{ url: string }>(sql`${where} ORDER BY f.url LIMIT ${opts.limit}`),
		db.get<{ n: number }>(sql`SELECT count(*) AS n FROM (${where})`)
	]);

	return {
		candidates: rows.map((r) => ({ url: r.url, ext: extensionOf(r.url) })),
		remaining: total?.n ?? rows.length
	};
}

/**
 * Re-runs the FTS5 DDL idempotently and rebuilds the index from `file_text`.
 *
 * The admin panel's `ensureIndex`, and the whole recovery story for the one
 * hand-written migration: the index is **external content**, so `'rebuild'`
 * reconstructs it from the stored text with no re-extraction at all. Whatever
 * dropped the objects — a stray `db:push`, a hand-run statement — this puts them
 * back.
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
 * Merges the index's b-tree segments.
 *
 * Worth one run after a large backfill. `('merge', 500)` rather than
 * `('optimize')` because optimize is a single unbounded statement and D1 caps a
 * query at 30 seconds; merge does a bounded amount of work and can simply be run
 * again.
 */
export async function optimizeFileTextIndex(db: DB): Promise<void> {
	await db.run(sql`INSERT INTO file_text_fts(file_text_fts, rank) VALUES('merge', 500)`);
}
