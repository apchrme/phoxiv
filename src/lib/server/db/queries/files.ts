import { asc, eq, inArray, sql } from 'drizzle-orm';
import { fileText, olympiads, problemFiles, problems, yearFiles, years, type DB } from '../index';
import type { FileSearchProblem, FileSearchResponse, FileSearchResult } from '$lib/types';
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
	 * The FTS5 `MATCH` expressions to try, **most precise first**: the caller runs
	 * them in order and stops at the first that returns a row.
	 *
	 * **Empty means "nothing searchable"** — the caller must then skip the query
	 * rather than run an empty `MATCH`.
	 */
	plans: string[];
	/**
	 * The query echoed to the client: the **whole** normalised query, phrases
	 * re-quoted, nothing capped.
	 *
	 * It deliberately describes no single plan. There is no longer one expression
	 * to echo, and echoing the rung that happened to hit would tell the user that
	 * words had been dropped when they had not — which is what the old echo did,
	 * truncating to the eight tokens the one expression ran.
	 */
	echo: string;
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
 * A user's query, turned into a **ladder** of FTS5 `MATCH` expressions, none of
 * which can be a syntax error.
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
 * # Why a ladder, and not one expression
 *
 * There used to be exactly one: every token ANDed, capped at eight. Both halves
 * of that were wrong, and in opposite directions.
 *
 * The cap **stopped the query narrowing**. `two water reservoirs are separated
 * by a vertical wall mn` ran as its first eight words and returned five files
 * from five different olympiads; the same sentence typed inside quotes returned
 * the one file it had been copied out of, and nothing else.
 *
 * Raising the cap on its own would have been worse, and that was measured rather
 * than guessed: **that** file indexes `figure` as `gure`, because the PDF emits
 * U+0000 for the `fi` ligature and `normalizeExtracted` strips it with the rest
 * of the control characters. Every ANDed term is another chance to hit a hole
 * like that, and one hole takes the whole result set to zero — ANDing the full
 * sentence matches nothing at all. More words would have traded too many results
 * for none.
 *
 * So precision and recall get a rung each, tried in order, and {@link searchFiles}
 * stops at the first that returns a row:
 *
 * | rung | expression | built when |
 * | --- | --- | --- |
 * | 1 phrase | `"w1 w2 … wN"`, `*` on the last word | ≥2 tokens, none quoted |
 * | 2 and | `"w1" AND … AND "wN"`, `*` on the last | any token at all |
 * | 3 or | `"w1" OR … OR "wN"`, no `*` | ≥3 tokens |
 *
 * Rung 1 is dropped the moment the user quotes something themselves: an explicit
 * `"…"` is them saying what the phrase is, and re-grouping the whole query around
 * it would ignore that.
 *
 * The **trailing `*` on a phrase** is what keeps search-as-you-type alive, and
 * the grammar it rests on was checked against SQLite 3.53's FTS5 rather than
 * assumed: `"two water reserv"*` matches `two water reservoirs …`, where
 * `"two water reserv"` matches nothing. Without it the panel would go blank on
 * every keystroke in the middle of a word.
 *
 * Rung 3 is not the desperate rung it looks like, because bm25 **ranks by
 * coverage, and strongly**. On the sentence above, the file it had been copied
 * out of scored `-4.96` against `-0.73`, `-0.33` and `-0.000008` for the near
 * misses — the right file first by a wide margin, in exactly the case where
 * rung 2 returns nothing.
 *
 * # What a query becomes
 *
 * One row per plan; a blank first cell continues the query above it.
 *
 * | typed | plan |
 * | --- | --- |
 * | `gravitation` | `"gravitation"*` |
 * | `mc^2 relativ` | `"mc 2 relativ"*` |
 * |  | `"mc" AND "2" AND "relativ"*` |
 * |  | `"mc" OR "2" OR "relativ"` |
 * | `"black hole" entropy` | `"black hole" AND "entropy"*` — quoted, so no rung 1 |
 * | `"black hol` | `"black hol"` — open phrase, not extended |
 * | `foo OR bar` | `"foo or bar"*` |
 * |  | `"foo" AND "or" AND "bar"*` |
 * |  | `"foo" OR "or" OR "bar"` |
 * | `-NEAR("a" b)` | `"near" AND "a" AND "b"` — no `*`, `b` is one character |
 * |  | `"near" OR "a" OR "b"` |
 * | `???` | no plans at all → skip the query, empty results |
 *
 * `AND` is written explicitly even though FTS5's implicit operator between two
 * strings is already AND, so the expression does not depend on that default.
 *
 * Each cap keeps the **first** N tokens, not the last, so a plan stays stable as
 * the user keeps typing.
 *
 * The prefix `*` marks the word the user is still in the middle of, so it goes on
 * the **last token only**, and never on a single character, since `a*` probes a
 * large slice of the index for almost no signal. It is never added to a phrase the
 * *user* closed — they said where it ended — which is a different thing from the
 * `*` rung 1 puts on the phrase it builds itself, whose last word is bare by
 * construction.
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

	// Guarded on emptiness rather than pushed unconditionally: with no tokens the
	// join is `''`, which is not a plan but an empty `MATCH` waiting to be run.
	const anded = tokens.slice(0, MAX_DEEP_QUERY_TOKENS);
	const lastIndex = anded.length - 1;
	if (anded.length > 0) {
		plans.push(anded.map((t, i) => (i === lastIndex ? prefixed(t) : quoted(t))).join(' AND '));
	}

	// Two tokens would only restate rung 2's inputs under a weaker operator, so
	// this starts at three.
	if (tokens.length >= 3) {
		plans.push(tokens.slice(0, MAX_DEEP_QUERY_TOKENS).map(quoted).join(' OR '));
	}

	// A dedupe that cannot fire as the rungs are built above — rung 1's `>= 2` is
	// what rules out the one collision there is, a single token, where rungs 1 and
	// 2 would both be `"word"*`. It stays because it is one call: a fourth rung, or
	// a lower cap, must not silently pay twice for the same scan.
	return { plans: [...new Set(plans)], echo };
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
 * # Two passes, and why it is not one
 *
 * This used to be a single CTE that selected `snippet()` alongside `rank`. It
 * read **2,124 + 3 × `limit`** D1 rows per call — measured, not estimated — and
 * that 2,124 is exactly the number of `status = 'ok'` rows in `file_text`. The
 * fixed term is **independent of the query**: a term matching two documents cost
 * 2,130 rows, and two different queries matching 402 and 469 documents both cost
 * exactly 2,186. `snippet()` on an **external-content** FTS5 table, evaluated in
 * the same statement as an unconstrained `MATCH`, walks the whole content table
 * once, whatever the `LIMIT` — the `LIMIT` bounds the rows returned, not that
 * walk. It made deep search the single most expensive query in the app, ~26% of
 * all rows read.
 *
 * Splitting it removes the fixed term entirely, because the second pass
 * constrains the cursor to known rowids and so seeks instead of walking:
 *
 * | | rows read |
 * | --- | --- |
 * | one statement, `snippet()` beside `rank` | ~2,186 |
 * | pass 1, rowids in rank order, no `snippet()` | ~41 |
 * | pass 2, `snippet()` constrained by `rowid IN (…)` | ~63 |
 *
 * ~104 against ~2,186, for byte-identical snippets and ordering — about **21×**.
 * Do not fold these back into one statement to save a round trip; the round trip
 * costs ~3 ms and the fold costs ~2,100 rows.
 *
 * # Pass 1 must not select `snippet()`
 *
 * That is the entire point, and it is the one edit that would silently undo
 * this: adding `snippet()` back to the ranking query reintroduces the full walk
 * even though the results would not change.
 *
 * # `status = 'ok'` is filtered in pass 1, *before* the `LIMIT`
 *
 * It used to be a `JOIN` in the outer half of a CTE — i.e. **after** the `LIMIT`
 * — so a non-`ok` row inside the top `limit` shrank the result set instead of
 * being skipped over. That, and not the dedupe its comment claimed, is what the
 * old ×3 over-fetch was really compensating for; the ×3 merely made the shortfall
 * unlikely rather than impossible, and would still have under-filled had more
 * than two thirds of a window been non-`ok`. Filtering before the `LIMIT` returns
 * exactly `limit` eligible rows and is what makes {@link searchFiles}' `+ 1`
 * sound.
 *
 * The join costs ~21 rows over the bare index scan, which is the price of not
 * depending on a distant invariant — today no non-`ok` row *can* match, because
 * {@link writeFileText} nulls `text` on any non-`ok` write and the trigger
 * indexes `coalesce(text, '')`, but nothing here would notice if that changed,
 * and this module's contract explicitly admits writers as blunt as a hand-run
 * `wrangler d1 execute`.
 *
 * # Rank order comes from pass 1 only
 *
 * Pass 2 is constrained by rowid and returns rows in **rowid order**, which is
 * not rank order, so its rows are folded into a map and re-emitted in pass 1's
 * sequence. Ordering the result by anything else — `id`, or pass 2's natural
 * order — silently discards bm25 and returns insertion order, which would
 * quietly falsify the "the array order IS the rank" contract the response shape
 * rests on. `rank` is therefore never carried past pass 1: the sequence *is* the
 * score.
 *
 * # A row in pass 1 but not pass 2 is dropped
 *
 * Which is the same outcome the old `JOIN … AND ft.status = 'ok'` produced, and
 * the same degradation {@link searchFiles} already documents for a url with no
 * owning row: fewer results, never a wrong one. The two passes are separate D1
 * statements rather than one transaction, so a concurrent write between them can
 * also drop a row — harmless for the same reason.
 *
 * Pass 2 binds one parameter per rowid plus the match, so it inherits
 * {@link resolveOwners}' constraint: fine at `DEEP_SEARCH_LIMIT` = 20, but
 * **raising the limit past ~90 means chunking** against D1's 100-parameter cap.
 */
async function selectFtsHits(db: DB, match: string, limit: number): Promise<FtsHit[]> {
	const ranked = await db.all<{ id: number }>(sql`
		SELECT file_text_fts.rowid AS id
		FROM file_text_fts
		JOIN file_text ft ON ft.id = file_text_fts.rowid AND ft.status = 'ok'
		WHERE file_text_fts MATCH ${match}
		ORDER BY rank
		LIMIT ${limit}
	`);
	if (ranked.length === 0) return [];

	const ids = ranked.map((row) => row.id);
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
 * chunking**, here and in {@link selectFtsHits}' snippet pass alike, which is why
 * the caller must dedupe and truncate *before* calling.
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
 * The query arrives as a **ladder** of `MATCH` expressions — see
 * {@link sanitizeFtsQuery} — and this walks it, stopping at the first that
 * returns a row. Stopping early is not an optimisation but the ranking itself:
 * every rung is looser than the one above it, so a phrase hit must never be
 * diluted by the near misses the `OR` rung would have added.
 *
 * Four D1 queries when the first plan hits, exactly as before the ladder:
 * {@link selectFtsHits}' two passes in sequence, then the two owner reads in
 * parallel — around 200 rows read in total, of which the owner resolution is the
 * larger half. A query that sanitises to nothing costs **no D1 read at all**.
 *
 * A plan that matches nothing costs **one** statement rather than two, because
 * {@link selectFtsHits} returns before its snippet pass when the ranking pass
 * comes back empty — and a ranking pass measured ~20 rows for a query matching
 * 402 documents. So the ladder's worst case, a query that matches nothing at any
 * rung, is three ranking passes instead of one: ~60 rows, on top of the
 * {@link hasFileText} read a total miss already paid for its empty state.
 *
 * The **modal** case for a multi-word query is neither of those two, and it is
 * worth naming rather than reading the best case as typical: rung 1 asks for the
 * words *adjacent*, which most real queries are not, so the usual shape is one
 * empty ranking pass followed by rung 2's two — five statements, one ~20-row
 * pass more than before the ladder. That is what buys the phrase hit in the case
 * where it exists, and it is the price the whole design is set against.
 *
 * The index is fetched **one row past the limit**, and that one row is the whole
 * reason to fetch past it: `truncated` below has to distinguish "exactly
 * `DEEP_SEARCH_LIMIT`" from "more than that", and nothing else needs the surplus.
 *
 * It used to over-fetch ×3, and its comment justified that by the row count not
 * being the hit count — which was never true here: `file_text.url` is `UNIQUE`
 * and {@link selectFtsHits} returns one row per `file_text` row, so the dedupe
 * below collapses nothing, and `kept` is sliced *before* {@link resolveOwners},
 * so the surplus could not backfill an orphaned url either.
 *
 * The surplus **was** doing something, just not that: `status = 'ok'` used to be
 * filtered after the `LIMIT`, so the over-fetch backfilled rows the filter
 * dropped. Cutting it to `+ 1` is only sound because {@link selectFtsHits} now
 * filters before the `LIMIT` — the two changes go together, and reverting either
 * alone silently shortens result sets. Verified by diffing this endpoint's bodies
 * across both, including with rows deliberately demoted out of `ok`.
 *
 * The map is still built by url rather than by rowid, because it is also what
 * carries each snippet to the assembly loop, and because it keeps this correct
 * if `file_text.url` ever stops being unique.
 *
 * None of this bounds the **bm25 scan**: `ORDER BY rank` makes FTS5 score every
 * matching document whatever the `LIMIT`, and `MAX_DEEP_QUERY_TOKENS` is still
 * the only control on that. Rung 3 is the one rung where that matters — an `OR`
 * matches far more documents than the `AND` of the same words does — which is
 * exactly why it runs last, and only once the two narrower rungs have found
 * nothing. It stays cheap in D1's billing either way, because a ranking pass
 * reads the FTS index and not the content table.
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
	const { plans, echo } = sanitizeFtsQuery(query);

	// Nothing searchable — `???`, or punctuation only. No D1 read: the reason
	// there are no results is the query, not the index, so `indexEmpty` stays
	// false without asking.
	if (plans.length === 0) return { query: echo, results: [], truncated: false, indexEmpty: false };

	// Down the ladder. `hits` holds the last rung tried, which is empty only if
	// every one of them came back empty.
	let hits: FtsHit[] = [];
	for (const match of plans) {
		hits = await selectFtsHits(db, match, DEEP_SEARCH_LIMIT + 1);
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
 * **`withCount` is opt-in because the count is the expensive half.** The `LIMIT`
 * bounds the rows returned but not the scan, and the `count(*)` twin has no
 * `LIMIT` at all — it materialises the whole `year_files ∪ problem_files` union
 * and probes `file_text` once per url, which at the current corpus is ~4,500 D1
 * rows read *per call*. It answers nothing the backfill needs per page: its only
 * consumer is one approximate progress line, so `reindex-cli.ts` asks for it on
 * the first page of a sweep and counts down locally from there. Left unconditional
 * it was the single largest cost of a backfill run after the extraction itself.
 *
 * The `status = 'skipped'` clause is what lets a *wider* extractor pick up what a
 * narrower one passed on. The browser skips `.docx`/`.xlsx`; the local script can
 * read them, so it passes its own extension list here and those rows re-enter the
 * queue for it alone. A `.zip` is in nobody's list and therefore converges to
 * `skipped` forever, which is the point.
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

	// `undefined` rather than a second branch: `Promise.all` passes a non-promise
	// straight through, so the two stay parallel when the count *is* wanted.
	const [rows, total] = await Promise.all([
		db.all<{ url: string }>(sql`${where} ORDER BY f.url LIMIT ${opts.limit}`),
		opts.withCount ? db.get<{ n: number }>(sql`SELECT count(*) AS n FROM (${where})`) : undefined
	]);

	const candidates = rows.map((r) => ({ url: r.url, ext: extensionOf(r.url) }));

	// The key is *omitted* when it was not asked for, rather than sent as 0 or as
	// `candidates.length`: "I did not count" and "there are none left" are
	// different answers, and the caller drives its loop off `candidates.length`.
	return opts.withCount ? { candidates, remaining: total?.n ?? candidates.length } : { candidates };
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
