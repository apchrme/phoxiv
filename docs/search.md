# Search

phoXiv has two searches. They share one ⌘K dialog and little else.

|                  | Problem mode                                      | Files mode (deep search)                              |
| ---------------- | ------------------------------------------------- | ----------------------------------------------------- |
| A result is      | a problem                                         | **a file**                                            |
| Matches against  | olympiad id, name, year, problem number and title | the text inside the document                          |
| Where it runs    | the browser, over the whole corpus                | D1, over an FTS5 index                                |
| Endpoint         | `GET /api/search`, once per session               | `GET /api/search/files?q=…`, once per settled query   |
| Matcher          | uFuzzy, typo-tolerant                             | a ladder of FTS5 `MATCH` expressions, prefix-extended |
| Ranking          | uFuzzy's ordinal order                            | bm25 (`rank`)                                         |
| Cap              | `MAX_RESULTS` = 50                                | `DEEP_SEARCH_LIMIT` = 20                              |
| Filters          | topic and progress                                | olympiad only                                         |
| Activating a row | navigates to the year anchor                      | opens the file in a new tab                           |

A bm25 score and an ordinal fuzzy rank can't be interleaved, so deep search is a
separate mode, not a second section of one list. Only one kind of result is on
screen at a time.

## Why deep search matches files, not problems

A year-level PDF often contains every problem of that year. If hits were
reported per problem, a phrase from T1 would also claim T2. So the result is the
file: "this document contains your phrase", which is exactly what the index
knows.

- **A file attached to several problems is one row**, listing each problem.
- **A year-level file is badged "Whole year".** An empty
  `FileSearchResult.problems` means year-level; there is no `level` field.
- **Topic and progress filters can't apply; the olympiad filter can.** One PDF
  spans every topic and completion state in its year, but belongs to exactly one
  olympiad (`years.olympiad_id` is `NOT NULL` with one foreign key, and
  `FileSearchResult.olympiadId` is a scalar).

## Problem mode: the fuzzy index

`GET /api/search` returns the whole problem corpus as `SearchItem[]`, shared-cached
like the rest of `/api/`. There is no server-side query path: the dialog fetches
the body on first open and matches every keystroke in the browser.

Each item has a precomputed, lowercased `searchText` of olympiad id, olympiad
name, year, problem number and title. That string is the ranking contract.

> **Never put a topic name in `searchText`.** It would change the ranking and let
> a visitor infer a problem's topic by typing "Relativity", which is the spoiler
> the design prevents. Topics travel as structured data for the filter only, and
> are never shown in a result row. See [data-model.md](./data-model.md#problems).

Matching uses one uFuzzy instance in
[`$lib/utils/fuzzy.ts`](../src/lib/utils/fuzzy.ts) with `intraMode: 1,
intraIns: 1`: one inserted character per term, enough for a typo. `rank()`
returns `[]` for an empty query by contract; the "empty query, filter set" case
bypasses it.

### Filter, then rank

```ts
const filteredIndex = $derived.by(() => filterSearchItems(index, { topics, status }, progress));
const filteredHaystack = $derived(filteredIndex.map((i) => i.searchText));
const results = $derived.by(() => rank(filteredIndex, filteredHaystack, query));
```

**Filter before ranking.** `rank()` caps at 50, so filtering its output would
show two "Done" results when forty exist further down.

- `filteredHaystack` is derived from `filteredIndex`, so the two can't drift;
  `rank` maps a haystack index straight back to `items[idx]`.
- `filteredIndex` never reads `query` and the ranking never reads `progress`. With
  no filter set, `filterSearchItems` returns the same array, so nothing
  downstream recomputes.
- `index` and `progress` are `$state.raw`: they are replaced wholesale, and a deep
  proxy would trap every per-keystroke element read.

### The filters, and why they vanish

The topic and progress predicates live in [`$lib/filters.ts`](../src/lib/filters.ts),
so the olympiad page and the dialog agree on what "Done" or "Relativity" selects.
`isDone(progress, olympiadId, year, number)` keys on the olympiad first:
`progressKey` is only `(year, number)`, so without it IPhO 2019 T1 and APhO 2019
T1 would collide. That is why `/progress` returns a nested `GlobalProgressMap`.

In the dialog:

- **The topic filter is hidden if the cached payload has no `topics`.**
  `indexHasTopics` guards the deploy window only and is marked for deletion a day
  after the purge.
- **The progress filter shows only when signed in.** Signing out resets `status`
  to `all`, so nobody filters by a control that has gone.
- **In files mode both disappear, rather than grey out**, and the olympiad filter
  takes their place. A disabled `TopicSelect` keeps its filled look and would
  claim a filter is active. Switching modes discards nothing. Each mode says so:
  files mode shows "topic and progress filters don't apply to files", and problem
  mode's summary bar appears whenever the olympiad filter is set. A filter that is
  set but invisible reads as "search is broken".
- **The olympiad filter is files-mode only, single-select, and applied on the
  server** (see [below](#the-olympiad-filter-a-url-range-not-a-join)). It is
  `OlympiadPicker.svelte` with `trigger="icon"`: an icon-only square that fills
  while set, with a searchable combobox behind it, since the list grows with the
  archive. The same component picks olympiads on `/contribute` and (with
  `multiple`) in `/admin`. It is bits-ui's `Popover` + `Command`, hand-styled,
  because neither is vendored in [`ui/`](../src/lib/components/ui) and adding them
  would need the shadcn CLI ([CLAUDE.md](../CLAUDE.md) rule 2). It uses
  `shouldFilter={false}` with `matchesOlympiadText`, because `Command`'s own filter
  reorders rows.
- **The current page's olympiad is listed first**, under "On this page". It is
  hoisted, **never preselected**: a filter that set itself from the URL would
  change results with only the trigger's fill as a clue.
- **An empty query with a filter set lists the first 50 of the filtered pool,
  unranked.** That answers "every relativity problem I haven't done", which typing
  can't. `getSearchIndex` returns a deterministic order so this isn't
  `problems.id` order.

## Getting text into the index

### The parser runs in the contributor's browser

**The Worker never parses a PDF**: no PDF library, no `ai` binding, nothing in
`wrangler.jsonc`. pdf.js would add about 0.5 MB gzipped to a ~0.43 MB server
bundle, paid as cold-start time on every route, for a path used a few times a
month. New uploads are parsed in the contributor's browser on file-pick; existing
files by a local `bun` script. The Worker only stores, indexes and searches.

[`$lib/pdf-text.ts`](../src/lib/pdf-text.ts) loads a vendored pdf.js build from
`static/vendor/pdfjs/` (a static asset served by `ASSETS`) through a **runtime
string URL**, dynamic-imported with `@vite-ignore`.

> **Don't make this a static import, or a dynamic import Vite can resolve.** It
> would join the module graph, and Rollup would emit pdf.js into the Worker
> bundle. See [the bundle check](./deployment.md#the-bundle-check).

Types come from `pdfjs-dist`, a devDependency pinned to the vendored version,
through `import type`, which is erased at compile time. Hand-written types once
let a call to `PDFDocumentProxy.destroy()` (removed in pdf.js 6) pass
`svelte-check` and throw in every browser. The types are still only a promise
about the file on disk, so the item join also checks `'str' in item`.

- **Two caches, for the module and the `PDFWorker`.** `getDocument` starts a new
  worker whenever it isn't given one. The cached worker is replaced if it reports
  `destroyed`, since a dead one makes every later extraction fail.
- **Each extraction destroys its own loading task**, not the document or the
  worker. That frees the document and leaves the shared worker alone. The call has
  its own `try/catch` inside the `finally`, because a throw there would discard
  the text already extracted. Leak the worker rather than lose the text.
- **`hasEOL` becomes `\n`, not a space**, because de-hyphenation looks for `-\n`.
- **The page loop stops** once the raw text passes twice `TEXT_CHAR_CAP`.

**`extractText` never throws.** Every failure returns `{status: 'error'}`,
because the upload must go ahead anyway and the row lands `pending` for the
backfill. Since that catch also swallows our own bugs, it `console.error`s the
file name and the real error, and shows the parser's message to the contributor,
muted and monospaced.

### Normalisation, and why the order of its steps is fixed

`normalizeExtracted` in [`$lib/search.ts`](../src/lib/search.ts) runs in the
browser, in `uploadFile`, and in the backfill. All three must agree, or the index
and snippet offsets disagree.

1. **`NFKC`** folds ligatures (`ﬁ` → `fi`) and full-width forms.
2. **De-hyphenate** `(\p{Ll})-\n(\p{Ll})` → `$1$2`. Must run before whitespace
   collapses, or there's no newline to key on. Lowercase-to-lowercase only, so
   `X-\nray` survives; it will occasionally glue a real compound.
3. **Strip C0/C1 controls, soft hyphens, zero-width and bidi marks.** **This
   guarantees the STX/ETX snippet sentinels never occur in stored text.** `\t`,
   `\n` and `\r` are kept so step 4 still sees word boundaries.
4. **Collapse whitespace and trim.**

It doesn't lowercase (`unicode61` folds case, and snippets should show real
case; `getSearchIndex` does lowercase because uFuzzy needs it). It doesn't strip
math (`\alpha` indexes as `alpha`).

`capExtracted` then cuts to `TEXT_CHAR_CAP` (512 000 chars) on a whitespace
boundary, so no half-word reaches a prefix query, and sets `truncated`.

### The write path

`FileSection.svelte` extracts on `change` and submits the text as a hidden
`extractedText` field alongside the file. In `uploadFile`, `putFileText` runs
below the "nothing below this line may fail the upload" line: the object is
already in R2 and the row in D1, so failing here would misreport the upload. Bad
text becomes a `pending` row instead. `putFileText` turns every input into
exactly one upsert, as below. That upsert can still reject on a D1 error, so
`uploadFile` calls it with `.catch(() => {})`. Keep that catch.

| Case                                                           | Row                                            |
| -------------------------------------------------------------- | ---------------------------------------------- |
| extension not in `EXTRACTABLE_EXTS`                            | `skipped`                                      |
| field absent or blank (old browser, JS off, extraction failed) | `pending`                                      |
| over `MAX_SUBMITTED_TEXT_CHARS` (1 000 000)                    | `pending`, with `error` recorded               |
| under `MIN_EXTRACTED_CHARS` (32) after normalising             | `empty` (a scan)                               |
| otherwise                                                      | `ok` + text, chars, truncated, engine, version |

**`extractedText` comes from the client.** Four things contain that:

1. Only `requireOlympiadEditor` reaches the action, and an editor could already
   upload a mislabelled file. The trust boundary is unchanged.
2. **The server re-runs `normalizeExtracted`.** This is the security step: it
   strips forged sentinels and applies the cap.
3. A hard size gate before the write, well under D1's 2 MB row limit.
4. The text never becomes HTML. It leaves the server only as a bounded snippet.

Because extraction finishes before submit, the editor reports the outcome before
anything is stored ("12 pages, 34 000 characters — searchable", "No text found.
This looks like a scanned PDF…", or "ZIPs aren't searchable" from
`isExtractable`), so a scan can be swapped for a text PDF. The year editor also
shows a per-file badge from `getFileTextStatuses`: nothing for `ok`, "no text",
"not searchable" or "pending".

## The index

`file_text` holds one row per document, keyed by the whole CDN url.
`file_text_fts` is an external-content FTS5 table over its `text`, kept in step by
three triggers. The DDL, statuses, recovery, and why `db:push` must never touch a
real database are in [data-model.md](./data-model.md#the-full-text-index). For
search:

- **External content**, so `snippet()` works and a tokenizer change is a
  `DROP`/`CREATE`/`'rebuild'` with no re-extraction.
- **`prefix='2 3'`**, so `gravit*` is an index seek.
- **`remove_diacritics 2`** folds accents, for translated papers.

> **No endpoint may select `file_text.text`.** Only `snippet()` reads it, inside
> the FTS5 query, so the corpus of third-party papers can't be bulk downloaded.
> Never write a query function that returns the column.

| Mechanism           | Keeps in step                                                   |
| ------------------- | --------------------------------------------------------------- |
| the triggers        | the index with `file_text`, for every writer, even hand-run SQL |
| `extractor_version` | `file_text` with the extraction pipeline                        |
| `etag` / `bytes`    | `file_text` with the object in R2                               |
| the url join        | results with the file tables, with no dependency on cleanup     |

## The query layer

All of this is in
[`$lib/server/db/queries/files.ts`](../src/lib/server/db/queries/files.ts).

### Sanitisation is a grammar problem, not an injection one

The `MATCH` string is a bound parameter, so nothing reaches SQL. But FTS5 parses
it, and a bare `"`, `*`, `-`, `NEAR`, `OR` or `(` is a syntax error: a 500 on
input like `e = mc^2`.

**Every token becomes a double-quoted FTS5 string**, which makes every operator
inert. No escaping is needed, because `tokenize` keeps only letters, digits and
(inside a phrase) spaces.

### The query ladder

`sanitizeFtsQuery` returns expressions, most precise first. `searchFiles` runs
them in order and **stops at the first that returns a row**; each rung is looser,
so a phrase hit is never diluted by near misses.

| Rung     | Expression                                  | Built when                                                          |
| -------- | ------------------------------------------- | ------------------------------------------------------------------- |
| 1 phrase | `"w1 w2 … wN"`, `*` on the last word        | ≥ 2 tokens, none quoted by the user; first 32 (`MAX_PHRASE_TOKENS`) |
| 2 `AND`  | `"w1" AND … AND "wN"`, `*` on the last word | any token; first 24 (`MAX_DEEP_QUERY_TOKENS`)                       |
| 3 `OR`   | `"w1" OR … OR "wN"`, no `*`                 | ≥ 3 tokens; same cap                                                |

- **Rung 1 is skipped if the user quoted anything**; they've said where the
  phrase is.
- **Don't replace the ladder with one bigger `AND`.** Extracted text has holes
  (one file indexes `figure` as `gure`, because its PDF emits U+0000 for the `fi`
  ligature), and each extra `AND`ed term is another chance to match nothing. The
  `OR` rung recovers from that, and bm25 ranks by coverage strongly enough that it
  still puts the right file first.
- **The trailing `*` on a phrase is a real prefix match** (checked on SQLite 3.53):
  `"two water reserv"*` matches `two water reservoirs`. Without it results blank
  mid-word.

| Typed                  | Plans, in order                                                                  |
| ---------------------- | -------------------------------------------------------------------------------- |
| `gravitation`          | `"gravitation"*`                                                                 |
| `mc^2 relativ`         | `"mc 2 relativ"*` · `"mc" AND "2" AND "relativ"*` · `"mc" OR "2" OR "relativ"`   |
| `"black hole" entropy` | `"black hole" AND "entropy"*` (quoted, so no rung 1)                             |
| `"black hol`           | `"black hol"` (open phrase, not extended)                                        |
| `foo OR bar`           | `"foo or bar"*` · `"foo" AND "or" AND "bar"*` · `"foo" OR "or" OR "bar"`         |
| `-NEAR("a" b)`         | `"near" AND "a" AND "b"` (no `*`: `b` is one character) · `"near" OR "a" OR "b"` |
| `???`                  | none: no query, empty results                                                    |

- **An unbalanced trailing quote opens a phrase**, so results don't blank when the
  quote is typed.
- **Bare words split on anything not a letter or digit**, as `unicode61` does.
- **Caps keep the first N tokens**, so plans stay stable as the user types.
- **The prefix `*` goes on the last token only**, never on a one-character token
  (`a*` scans much of the index), and never on a phrase the user closed.
- `AND` is written out rather than relying on FTS5's implicit default.

**Don't catch FTS errors and return `[]`.** An empty body for a query that should
work would sit in the shared cache for a day. Let bugs surface in observability.

### Two passes per rung

`selectFtsHits` is the only function that knows the index's shape; everything
above it consumes `FtsHit[]`. Pass 1 ranks, selecting rowids only; pass 2 fetches
snippets for exactly those rowids:

```sql
-- pass 1
SELECT file_text_fts.rowid AS id
FROM file_text_fts
JOIN file_text ft ON ft.id = file_text_fts.rowid AND ft.status = 'ok'
WHERE file_text_fts MATCH ?1          -- plus the olympiad scope, if any
ORDER BY rank LIMIT ?2;

-- pass 2
SELECT ft.id AS id, ft.url AS url,
       snippet(file_text_fts, 0, char(2), char(3), '…', 16) AS snippet
FROM file_text_fts
JOIN file_text ft ON ft.id = file_text_fts.rowid AND ft.status = 'ok'
WHERE file_text_fts MATCH ?1 AND file_text_fts.rowid IN (?2, ?3, …);
```

> **Never select `snippet()` in pass 1, and don't merge the passes.** On an
> external-content table, `snippet()` beside an unconstrained `MATCH` walks the
> whole content table regardless of `LIMIT`: about 2,100 D1 rows per call. With
> `rowid IN (…)`, FTS5 seeks instead, and both passes together read about 100.

- **Rank order comes from pass 1 only.** Pass 2 returns rowid order, so its rows
  are mapped back into pass 1's sequence. Sorting by anything else silently
  discards bm25.
- **Every eligibility test (`status = 'ok'`, the olympiad scope) runs in pass 1,
  before the `LIMIT`.** A filter after the `LIMIT` shrinks the window instead of
  narrowing it. Pass 1 fetches `DEEP_SEARCH_LIMIT + 1` rows so `truncated` can
  tell "exactly 20" from "more"; that is only sound while this rule holds.
- **Keep the `status = 'ok'` join**, even though no non-`ok` row can match today
  (`writeFileText` nulls `text` and the trigger indexes `coalesce(text, '')`).
  Hand-run SQL is an allowed writer.
- **A row in pass 1 but missing from pass 2 is dropped**, e.g. after a concurrent
  write. Fewer results, never a wrong one.

A rung that matches nothing costs one statement, since pass 2 is skipped.
`ORDER BY rank` scores every matching document, and `MAX_DEEP_QUERY_TOKENS` is the
only control on that, which is why the broad `OR` rung runs last. Under an
olympiad scope, pass 1 walks past every out-of-scope match, so a scoped pass can
read hundreds of rows.

### The olympiad filter: a url range, not a join

`GET /api/search/files` takes an optional `?olympiad=<id>`, which `searchFiles`
applies in **pass 1 of every rung**. That placement is the reason the parameter
exists: filtering the global top 20 afterwards would usually leave 0–3 rows, and
none if the olympiad has nothing in the global top 20.

> **If the filter ever moves after the `LIMIT`, delete the parameter.** The
> client could then do the same from a body it already has.

The predicate is `ft.url >= lo AND ft.url < hi`, from `olympiadUrlRange` in
[`storage.ts`](../src/lib/server/storage.ts), beside `fileKey` so the two key
derivations stay together. `lo` ends in `/`, so `ipho` can't match `iphox`: every
character an id can continue with sorts above `/`. `url` uses BINARY collation,
so the comparison is exact.

**Why a range:** FTS5's `xBestIndex` absorbs only `MATCH`, `rank` and its rowid.
Anything on the content table runs per candidate, so it must be free, and a range
on `url` is, because the `status` join already read that row. An `EXISTS` against
the file tables costs ~5 rows per candidate; a CTE of the olympiad's urls adds a
fixed cost per rung.

> **Don't add the scope to pass 2 "for symmetry".** It can't change the result,
> only the plan: the planner may drive from `file_text_url_idx` and lose the seek.

**A scoped result is not a subset of the unfiltered one, and that is correct.**
The ladder runs within the scope, so if rung 1 matches only out-of-scope files, a
scoped search falls to rung 2 and shows hits the unfiltered search never did.
Don't pin a scoped search to the unfiltered rung.

Two things stay global under a scope. **`hasFileText`/`indexEmpty`** mean "the
whole index is still empty", a fact about the pipeline; the client writes its own
scoped empty state. **Owner resolution** stays global, and the loop then drops any
row whose resolved `olympiadId` differs from the scope, since the file tables are
the authority and the url is only derived from them.

If the corpus grows ~10×, the next step is a second FTS5 column filtered inside
`MATCH`. Not yet: it needs two migrations, a full rebuild and a bm25 weight
change, and it would put an id inside the `MATCH` string.

### Resolving owners

`resolveOwners` turns kept urls into rows with two parallel queries (problem
files, year files) merged into a `Map`, which also folds a multi-problem file into
one row. Problem rows go first, so the more specific label wins. **A url with no
owning row is dropped**, so a stale index gives fewer results, never dead links;
that is why the index needs no foreign key.

**Raising `DEEP_SEARCH_LIMIT` past ~90 needs chunking** in the owner queries and
pass 2, which bind one parameter per url or rowid against D1's limit of 100.

### The snippet: plain text plus offsets, never HTML

`snippet()` wraps matches in markers you choose but **doesn't escape the text
around them**, and that text comes from contributor-uploaded PDFs.

> **Never mark snippets with HTML and render them with `{@html}`.** That is stored
> XSS on our own origin: a PDF containing `<img onerror=…>` would run.

So `snippet()` marks with ASCII STX/ETX (`char(2)`/`char(3)`), which
[normalisation](#normalisation-and-why-the-order-of-its-steps-is-fixed) keeps out
of stored text, and `splitSnippet` turns them into `{snippet, matches}`:

- It strips controls (except STX/ETX) and collapses whitespace **before**
  splitting, so the offsets fit the exact string the client slices.
- It walks with an indexed loop, not `for…of`: offsets are UTF-16 code units for
  `String.prototype.slice`, and code-point iteration would shift them.
- An unclosed range (a truncated snippet) is closed at the end.

On the client, `splitMarks` in `fuzzy.ts` turns ranges into parts that the
template renders as `<mark>` elements; nothing reaches `{@html}`. The ranges
crossed the wire, so they are validated. A non-array degrades to one unmarked part
(iterating `undefined` in a `$derived` would take down the list). A reversed,
overlapping or out-of-bounds range is **skipped, not repaired**, since clamping
its start would still mark text that didn't match. Only the end is clamped,
downwards.

`highlight()` in `fuzzy.ts` does feed `{@html}`, for problem titles typed by
contributors, and nothing else sanitises them. So it escapes every slice it
emits, on all its paths, before wrapping matches, and does so inside uFuzzy's
walk because the ranges index the unescaped string.

### The response shape

```ts
type FileSearchResponse = {
	query: string; // the whole normalised query, phrases re-quoted, nothing dropped
	results: FileSearchResult[]; // best first. The array order IS the rank
	truncated: boolean;
	indexEmpty: boolean;
};
```

- **`query` echoes the question, not the rung that answered.** Echoing a capped
  rung would suggest words were dropped.
- **There is no `rank` field.** A bm25 score is specific to FTS5 and would have to
  be faked if the index changed. Order is the rank.
- **`truncated`** drives the "Showing the 20 best-matching files" footer.
- **`indexEmpty`** lets a deploy ahead of the backfill say "still indexing". It is
  checked only when a query found nothing, and stays `false` if the query
  sanitised to nothing.

### Cost controls, and the cache

| Control                   | Value | Effect                                                                     |
| ------------------------- | ----- | -------------------------------------------------------------------------- |
| `MIN_DEEP_QUERY_LENGTH`   | 5     | no D1 read below it; enforced on client and server                         |
| `MAX_DEEP_QUERY_LENGTH`   | 200   | refused before D1 and the cache header; enforced on client and server      |
| `MAX_DEEP_QUERY_TOKENS`   | 24    | the real control on the bm25 scan; keeps queries inside D1's 30 s limit    |
| `MAX_PHRASE_TOKENS`       | 32    | looser, since a longer phrase can only match fewer documents               |
| `DEEP_SEARCH_LIMIT`       | 20    | fetched one row past, never further                                        |
| `normalizeDeepQuery`      | —     | `?q=Gravitation` and `?q=gravitation ` share one cache key                 |
| `isOlympiadFilter`        | —     | `/^[a-z0-9][a-z0-9-]{0,31}$/`; bounds cache keys, not an injection defence |
| `normalizeOlympiadFilter` | —     | absent, empty and `?olympiad=IPhO` are one key                             |
| `DEEP_DEBOUNCE_MS`        | 250   | client-side debounce                                                       |

- **Bad input gets a 400 before any D1 work and before the cache header**, as
  `/api/olympiads/[olympiad]` does for its 404. A cached 400 would outlive the bug
  that caused it.
- **`setSharedCache` runs after the query succeeds**, so a 500 is never cached.
- **The client refuses an over-long query itself, and never truncates it.** A 400
  would show "Couldn't search inside files." with a **Try again** that can never
  succeed, and truncating mid-word would add a spurious prefix term.

**The endpoint takes `q` and an optional `olympiad`, nothing else.** It reads no
cookie and never touches `locals.user`, which is what makes its bodies safe in a
shared cache. **Never add a per-user parameter** (`status`, `mine`); topics don't
apply to files. `olympiad` is allowed because a file has one olympiad and the
answer is the same for everyone.

| `olympiad`              | Response                                   | Cached |
| ----------------------- | ------------------------------------------ | ------ |
| absent or empty         | the unfiltered search                      | yes    |
| malformed               | 400, before D1 and before the cache header | no     |
| well-formed but unknown | 200 with no results (the range finds none) | yes    |

The 400 stops arbitrary strings minting cache keys, each costing a ladder walk.
An unknown id needs no `SELECT` on `olympiads`. `createOlympiad` only lowercases
and hyphenates, so its charset and the pattern above must change together.

It is `GET` because Cloudflare caches by URL including query string, and never
caches a POST. `AbortController` on the client saves bandwidth and keeps responses
in order, but not Worker work; the real volume controls are the debounce, the
minimum length, the normalised key, the session cache and `s-maxage`.

> **Purging:** bodies are keyed by query string, so purge-by-URL can't reach them.
> Changing the response shape, or which files a query returns, needs **Purge
> Everything** ([deployment.md](./deployment.md#purging-the-cache-after-an-api-change)).
> An optional new parameter needs no purge if the shape is unchanged and the
> unfiltered SQL is byte-identical, which is why `selectFtsHits` adds its scope
> with `sql.empty()`, not `1 = 1`.

## The client

The dialog is [`GlobalSearch.svelte`](../src/lib/components/search/GlobalSearch.svelte),
mounted from `+layout.svelte`, with its parts in
[`$lib/components/search/`](../src/lib/components/search).

### The mode switch is tabs, not a filter

The dialog is one `Tabs.Root` with three rows: the mode row
(`SearchModeTabs.svelte` and the close button), the input row, and two
`Tabs.Content` panels. The key-hint footer sits outside the tabs.

**Don't put the mode switch back in the filter row as an icon button.** It changes
what a result is, and there it read as a fourth filter. The tabs use labels, not
icons, so they say the rows are files.

- **The input row and the count-only live region sit outside both panels**, so
  there is one query and focus doesn't jump on mode change.
- **Each panel wraps its body in an `{#if}` on the mode.** bits-ui keeps inactive
  panels mounted, only `hidden`, so without it the problems panel would run
  `rank()` on every files-mode keystroke.
- **Each scroller is an inner `<div>`**, since a `display` utility on the panel
  would fight `hidden`. `resultsEl` is derived over both.
- **`Tabs.Root` takes `value=` and `onValueChange`**, not `bind:value` (bits-ui
  types it as `string`). `mode` is the single source of truth.
- **The input is refocused from the triggers, not `onValueChange`**, or the first
  arrow key would pull focus out of the tablist. Enter/Space need their own
  `onkeydown` because bits-ui `preventDefault()`s them, and ours must not.

### Why every piece of state lives in the shell

`Dialog.Content` sits inside bits-ui's `{#if shouldRender}`, so **its subtree
unmounts on close.** State inside it would reset every open and turn the session
caches into a fetch per ⌘K. The `<svelte:window>` handler also lives outside,
because it opens the dialog.

| Resource           | Fetched                                                 |
| ------------------ | ------------------------------------------------------- |
| `/api/search`      | on first open                                           |
| `/progress`        | on first open when signed in; again if `userId` changes |
| `/api/olympiads`   | on first entry into files mode                          |
| deep-search bodies | once per (query, olympiad) key                          |

- **"Fetched" guards are set only on success**, so a failure retries next open.
- **Each guard also checks an in-flight flag**, so rapid ⌘K presses don't fire
  duplicates. (`/progress` is `no-store`, so each would be a D1 read.) The progress
  flag holds a user id, so a different user's map is still fetched.
- **The guard flags are plain `let`s, not `$state`.** The fetches run from an
  `$effect`; guarding on a `$state` loading cell the same function writes would
  re-run the effect on failure and loop forever. The loading cells stay `$state`
  for the markup.
- **The olympiad list is fetched, not derived from the problem index**, which only
  knows olympiads with problems. It is fetched on entering files mode so ⌘K costs
  nothing extra for everyone else.
- **`userId` is a prop from `+layout.svelte`**, not `page.data.user`, which would
  tie a `$lib` component to the root layout's load shape.

### The `DeepSearch` class

[`deep-search.svelte.ts`](../src/lib/components/search/deep-search.svelte.ts)
holds files mode's network state. It is a plain `const` in the shell with `$state`
fields, so the cache survives open and close. The driving `$effect` stays in the
component, because the debounce depends on being an effect.

- **Every cell is keyed by (query, olympiad).** `deepCacheKey` joins them with
  `\n`, which a normalised query never contains. Keyed by query alone, switching
  olympiad would show the previous olympiad's answer.
- **The url omits `olympiad` when unfiltered** and always orders
  `?q=…&olympiad=…`, because Cloudflare keys on the raw query string.
- **The cache is a plain `Map`, not a `SvelteMap`.** `SvelteMap.has()` on a
  missing key subscribes to the whole map, so any response landing would re-run
  the driving effect and abort the request the user is waiting for. The screen
  reads `#landed`, which is `$state`. Eviction is insertion-order at 30 entries.
- **"None" is `null`, not `''`.** `''` is also the empty-input query, so it would
  make the panel show "Couldn't search inside files." as soon as files mode opened.
- **"Pending" covers the debounce as well as the fetch.** `schedule(key)` sets it
  before the `setTimeout` (and clears any old failure); `unschedule(key)` clears
  it in the teardown and in `run()`'s `finally`. Set inside `run()`, it would start
  250 ms late and flash "No files contain that phrase." first.
  Both are identity-guarded, because the teardown runs just before the re-run
  schedules the next key.
- **`#landed` lags the live query while a newer request is in flight**, so the
  panel keeps the last list instead of blanking. Anything that could show a stale
  marker compares against the live key instead.
- **A monotonic `#token` stops a superseded response rewinding the panel.** It is
  still cached, for backspacing. `AbortError` is not a failure. `res.ok` is
  checked, since an HTML error body makes `res.json()` throw.

### The debounce _is_ the effect's teardown

```ts
$effect(() => {
	if (mode !== 'files') return;
	const key = deepQuery;
	const _attempt = deep.attempt; // tracked: lets "Try again" re-fire the same query
	if (key.length < MIN_DEEP_QUERY_LENGTH) return;
	if (key.length > MAX_DEEP_QUERY_LENGTH) return; // refused, never truncated
	if (deep.has(key)) {
		deep.show(key);
		return;
	} // a cache hit is not a network event

	deep.schedule(key); // pending from here, not from inside the timer
	const controller = new AbortController();
	const timer = setTimeout(() => void deep.run(key, controller.signal), DEEP_DEBOUNCE_MS);
	return () => {
		clearTimeout(timer);
		controller.abort();
		deep.unschedule(key);
	};
});
```

Any dependency change re-runs the effect, and the teardown runs first:
`clearTimeout` cancels an unsent request and `abort()` supersedes a sent one.
**Every tracked read is synchronous and above the `setTimeout`**, so the fetch
adds no dependency and a landing response can't re-trigger itself. `schedule` and
`unschedule` only write, so they add none either.

### What the panel can show

States are chosen by branch order, in this order:

| State                 | Driven by                   | Shows                                                                    |
| --------------------- | --------------------------- | ------------------------------------------------------------------------ |
| Too long              | `deepTooLong`               | "That's too long to search inside files.", with the length and the limit |
| Failed                | `deep.hasFailed(deepQuery)` | "Couldn't search inside files." + **Try again**                          |
| Idle / too short      | `deepQuery.length < MIN`    | the explainer, plus "type at least 5 characters" once anything is typed  |
| Loading, nothing kept | `deepLoading` and no rows   | "Searching inside files…", from the keystroke                            |
| Still indexing        | `deep.indexEmpty`           | "No files have been indexed yet — this is still catching up."            |
| No matches            | rows empty, index non-empty | "No files contain that phrase."                                          |
| Results               | otherwise                   | the list, dimmed (`opacity-60`) while a newer query is in flight         |
| Truncated             | `deep.truncated`            | "Showing the 20 best-matching files"                                     |

"Too long" beats "failed" because it is never sent, so it must override a failure
left by an earlier query. The spinner replaces the magnifier in the input row.

**`visibleDeepResults` is not `deep.results`.** In the failed, too-short and
too-long states, `deep.results` still holds the cached list, but nothing is
rendered. `resultCount` is derived from what is rendered, in both modes, so the
keyboard never addresses an invisible row. Keep `visibleDeepResults`' conditions
in the panel's branch order.

### Keyboard, activation and reset

- **⌘K / Ctrl+K toggles the dialog**, matched on `e.key.toLowerCase()` without
  shift, so it still works with caps lock on.
- **⌘⇧F toggles the mode** and refocuses the input. It is unbound in the major
  browsers (unlike ⌘⇧K, Firefox's console), and the tabs are reachable anyway.
- **Arrows and Enter act only while focus is in the input.** Otherwise an open
  filter dropdown and the list would both react, since both portal at `z-50`.
- **`e.isComposing` returns early, after the chords.** During IME composition,
  Enter and the arrows belong to the candidate list; without the guard, committing
  a word would open a result. The chords stay above it because composition never
  uses ⌘/Ctrl and ⌘K is how the dialog closes.
- **The focused row is clamped on read, never written back**: `focused` is
  `resultCount === 0 ? 0 : Math.min(focusedIndex, resultCount - 1)`, and
  everything reads it. A landing response can shrink the list with no reset;
  writing the clamp back from an effect risks a loop. ArrowDown clamps with
  `Math.max(resultCount - 1, 0)` so an empty list doesn't park at `-1`.
- **Rows are found by `[data-result-index]`**, not position; the scroller holds
  other elements too.
- **A file row is a plain link** (`target="_blank" rel="noopener noreferrer"`, no
  handler), so middle-click and "Save link as" work. Enter calls `window.open`,
  falling back to the same tab, and the dialog stays open. Its olympiad and year
  aren't highlighted; the query matched the text, not the metadata.
- **Everything resets when `open` changes**, because most of the seven ways to
  open or close the dialog bypass our code. The mode resets to problems: **⌘K must
  never start by hitting the network.** Caches survive the reset.

One `role="status" aria-live="polite"` line above both panels announces the count
only, not row contents.

## Operating the index

New uploads are indexed as they arrive. Existing files are swept up by
`bun run index:backfill`; the procedure is in
[deployment.md](./deployment.md#backfilling-the-text-index).

`GET /admin/reindex` hands out work and `POST` accepts results. **The Worker
parses nothing in either direction.** The endpoint calls `requireAdmin` itself,
since a `+server.ts` runs no layout loads, and re-runs `normalizeExtracted` on
every posted text. There is no batch action in the admin panel; the Worker has
nothing to loop over, which also avoids the infinite submit loop recorded for
this panel (CLAUDE.md rule 8).

**The work queue is a query, not a table**, so the backfill is idempotent and
resumable: writing a file's row removes it from the result.

```sql
WITH files AS (SELECT url FROM year_files UNION SELECT url FROM problem_files)
SELECT f.url FROM files f LEFT JOIN file_text t ON t.url = f.url
WHERE t.id IS NULL                                          -- never seen
   OR (t.status IN ('pending','error') AND t.attempts < 3)   -- retryable
   OR t.extractor_version < ?1                               -- pipeline moved on
   OR (t.status = 'skipped' AND t.ext IN ?2)                 -- a wider extractor
```

- **`attempts < 3`** stops a poison file blocking the queue. `writeFileText`
  increments it for `pending`/`error` and resets it otherwise.
- **Bump `EXTRACTOR_VERSION`** to re-queue every older row, with no migration.
- **The `skipped` clause** lets the local script, which reads `.docx`/`.xlsx`,
  pick up what the browser skipped. A `.zip` stays `skipped`.
- Files loaded out of band (e.g. by rclone) are picked up too.

The admin Index tab shows counts by status and up to 50 failures, plus:

| Action             | What it does                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------ |
| **Rebuild index**  | `ensureFileTextIndex`: re-runs the FTS5 DDL with `IF NOT EXISTS`, then `'rebuild'`. No re-extraction needed  |
| **Merge segments** | `('merge', 500)`, not `('optimize')`, which is one unbounded statement against D1's 30 s cap. Safe to re-run |
| **Prune orphans**  | deletes rows whose url is in neither file table, and reports the count                                       |

Each posted batch writes one `index_files` activity-log row, not one per file.

**The tab fetches its counts from `admin/index-stats` on first open**, not in the
page load: they cost about 4,500 D1 rows and most `/admin` visits never open the
tab. `+page.svelte` mounts `IndexPanel` only once the tab is selected, because
bits-ui renders all tab contents eagerly. Don't move the query back into the load.

## Limits

Each of these is a decision, not an omission:

- **Scanned PDFs aren't searchable.** No OCR. A scan lands `empty`, shown to the
  contributor before upload and counted in the admin panel.
- **No deep link to a page.** It would be cheap (a `pages` column of offsets and a
  `#page=7` fragment) but isn't built.
- **`.zip` and legacy `.doc` are never indexed.** `.docx`/`.xlsx` only by the
  local script.
- **No per-user filters in deep search** (see
  [cost controls](#cost-controls-and-the-cache)).
- **Problem search ships the whole corpus.** If it outgrows one fetch, first
  dedupe `olympiadName`/`olympiadIcon`, a breaking shape change.
- **A `<mark>` can be a character off on an unusual title**, because
  `toLowerCase()` doesn't preserve length for every Unicode case pair. Cosmetic.
- **The results list lacks the full ARIA combobox pattern.** Half of it is worse
  than none, and it would have to be reconciled with bits-ui's focus trap. The
  olympiad picker has it via `Command`; the results list can't be a `Command`,
  since its rows are links and its input is the dialog's.

There is no test suite; the manual checks are in
[contributing.md](./contributing.md#the-gates).
