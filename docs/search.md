# Search

phoXiv has **two** searches, and they share one ⌘K dialog. They agree on almost
nothing — not what they match, not where they run, not what a result row means —
and keeping them distinct is what makes each of them explicable.

|                  | **Problem mode**                                  | **Files mode** (deep search)                          |
| ---------------- | ------------------------------------------------- | ----------------------------------------------------- |
| A result is      | a problem                                         | **a file**                                            |
| Matches against  | olympiad id, name, year, problem number and title | the **text inside** the document                      |
| Where it runs    | the browser, over the whole corpus                | D1, over an FTS5 index                                |
| Endpoint         | `GET /api/search`, once per session               | `GET /api/search/files?q=…`, once per settled query   |
| Matcher          | uFuzzy, typo-tolerant                             | a ladder of FTS5 `MATCH` expressions, prefix-extended |
| Ranking          | uFuzzy's ordinal order                            | bm25 (`rank`)                                         |
| Cap              | `MAX_RESULTS` = 50                                | `DEEP_SEARCH_LIMIT` = 20                              |
| Filters          | topic and progress apply                          | **neither applies**                                   |
| Activating a row | navigates to the year anchor                      | opens the file in a new tab                           |

The two scores are **incomparable** — a bm25 float and an ordinal fuzzy rank
cannot be interleaved — which is the underlying reason deep search is a _mode_
rather than a second section of one list. Only one kind of result is ever on
screen, so there are no header rows, no two lists and no cross-kind index
arithmetic: the arrow keys walk one array, and only the count and the activation
branch on mode.

## Why deep search matches files, not problems

This is the load-bearing design decision of the whole feature, and it is a
deliberate limit rather than a shortcut.

A year-level PDF routinely contains **every problem of that year**. If a hit were
reported at problem level, a phrase found anywhere in that document would claim
"IPhO 2019 T2" on the strength of text that actually belongs to T1. Making the
file the result unit removes the ambiguity: the row says _this document contains
your phrase_, which is exactly what the index knows and no more.

Three consequences follow, and each is handled rather than hidden:

- **A file attached to several problems is one row**, listing several problem
  numbers — not several rows.
- **A year-level file is badged "Whole year".** `FileSearchResult.problems` being
  **empty _is_ that flag**; there is no `level` field. The badge is spelled out in
  the UI because an absent list would otherwise just look like missing data.
- **The topic and progress filters cannot apply.** One year-level PDF spans every
  topic and every completion state in that year, so the filters are not merely
  unimplemented for files — they are _meaningless_ against one. See
  [The filters](#the-filters-and-why-they-vanish).

## Problem mode: the fuzzy index

`GET /api/search` returns the entire problem corpus as `SearchItem[]`, shared-cached
like everything under `/api/`. There is **no server-side query path for problem
search at all**: the body is fetched once on first open of the dialog and every
keystroke after that is matched in the browser.

Each item carries a precomputed `searchText` — a join of olympiad id, olympiad
name, year, problem number and title, lowercased — and that string _is_ the
documented ranking contract. **A topic name has no place in it.** Folding one in
would break the ranking order and, worse, let a visitor infer a problem's topic by
typing "Relativity" and seeing what surfaces, which is the actual spoiler the
design guards against. Topics travel on the payload as structured data, for the
filter to read; they are simply never part of the haystack and never rendered in
a result row. See [data-model.md](./data-model.md#problems).

Matching is one shared uFuzzy instance in
[`$lib/utils/fuzzy.ts`](../src/lib/utils/fuzzy.ts), configured `intraMode: 1,
intraIns: 1` — a single inserted character within a term, which absorbs a typo
without matching everything. `rank()` returns `[]` for an empty query **by
contract**, which is why the dialog's empty-query-with-a-filter branch bypasses it
rather than bending it.

### Filter, then rank

```ts
const filteredIndex = $derived.by(() => filterSearchItems(index, { topics, status }, progress));
const filteredHaystack = $derived(filteredIndex.map((i) => i.searchText));
const results = $derived.by(() => rank(filteredIndex, filteredHaystack, query));
```

**Filtering precedes ranking, and that is a correctness constraint rather than a
performance one.** `rank()` caps at 50, so filtering its _output_ would show two
"Done" results where forty exist further down the ranking. Do not "simplify" it
into a filter over `rank(index, …)`.

Two supporting details make it hold:

- **Alignment is structural.** `filteredHaystack` is derived _from_
  `filteredIndex`, so the two cannot drift. `rank` maps a haystack index straight
  back to `items[idx]`, so a haystack built from the unfiltered corpus would
  return the wrong problems entirely.
- **The three deriveds are split so each reads only what it needs.**
  `filteredIndex` never reads `query`, so typing cannot re-run the topic filter;
  the ranking never reads `progress`, so marking a problem done cannot re-run the
  fuzzy match.

The second-order effect is worth knowing: with a filter active the corpus `rank`
runs over is _smaller_, so filtering makes the per-keystroke match **faster**. The
filter layer costs nothing per keystroke, and with no filter set
`filterSearchItems` returns the _same array_ rather than a copy, so `$derived`'s
identity check skips every downstream recomputation.

`index` and `progress` are `$state.raw`, not `$state`: both are replaced wholesale
and never mutated, and a deep proxy over thousands of nested `SearchItem`s would
put a `Proxy` trap on every element read in the filter and the haystack build —
both of which run on a keystroke.

### The filters, and why they vanish

Both filters are problem-level concepts, promoted into
[`$lib/filters.ts`](../src/lib/filters.ts) so the olympiad detail page and the ⌘K
dialog share one set of predicates and cannot disagree about what "Done" or
"Relativity" selects. A `$lib` component cannot import from a route directory,
which is what forced the promotion; `StatusFilter.svelte` moved to
`$lib/components/` beside `TopicSelect.svelte` for the same reason.

`isDone(progress, olympiadId, year, number)` is the one to read closely. **The
olympiad level is what stops IPhO 2019 T1 and APhO 2019 T1 colliding** —
`progressKey` is `(year, number)` only, so a flat cross-archive map would silently
mark the wrong problems done. That is why `/progress` answers a nested
`GlobalProgressMap` rather than a flat one.

In the dialog:

- The topic filter is **hidden entirely when the cached payload predates
  `topics`**, rather than left offering a filter that silently matches nothing.
  `indexHasTopics` is a deploy-window guard, explicitly marked for deletion a day
  after the purge — not a feature.
- The progress filter renders **only when signed in**, the same rule as the
  olympiad page: "Done" could only ever be empty without a session. Signing out
  mid-session resets `status` to `all`, because otherwise the user would go on
  filtering by a control that is no longer on screen.
- In files mode **both vanish rather than greying out.** A disabled `TopicSelect`
  keeps the filled `default` variant it had in problem mode, so it would go on
  _claiming_ a filter is active while it isn't — worse than absent. Nothing is
  discarded; switching back restores both. One line above the results says so
  whenever a filter is set, so the switch is never silent.
- An empty query with a filter set lists the first 50 of the filtered pool,
  **unranked**. This is the whole cross-archive capability the filters unlock:
  "every relativity problem I haven't done" cannot be asked by typing, because
  typing narrows by _text_. It is also why `getSearchIndex` carries a
  deterministic top-level order — without it this list would come back in
  `problems.id` order.

## Getting text into the index

### The parser runs in the contributor's browser

**No `ai` binding, no PDF library in the Worker, no `wrangler.jsonc` change at
all.** The reason is a measurement rather than a preference:

|                                            | gzipped       |
| ------------------------------------------ | ------------- |
| the whole phoXiv server bundle             | ≈ 0.43 MB     |
| pdf.js, if it were bundled into the Worker | **≈ +0.5 MB** |

A Worker-side parser would be **larger than the entire application**, and that
size is paid as cold-start parse time on _every_ route, to serve a path that runs
a few times a month. It would fit inside the 10 MB limit; it is simply
disproportionate.

|                                    | where it runs                           | cost to the Worker |
| ---------------------------------- | --------------------------------------- | ------------------ |
| New uploads                        | the contributor's browser, on file-pick | **0 bytes**        |
| Existing files (one-time backfill) | a local `bun` script                    | **0 bytes**        |
| Storing, indexing, searching       | the Worker                              | unchanged          |

[`$lib/pdf-text.ts`](../src/lib/pdf-text.ts) reaches a vendored pdf.js build
through a **runtime string URL**, dynamic-imported with `@vite-ignore`. That form
is the whole point and must not be "tidied" into a static import: a dynamic import
Vite _can_ resolve joins the module graph, and Rollup then emits it into the
**server** build as well, which `adapter-cloudflare` bundles into the Worker.
A runtime string is the only form guaranteed absent from both bundles. The build
lives in `static/vendor/pdfjs/` and is served by the `ASSETS` binding, so it is a
static asset and not Worker script size. The one-command bundle check that keeps
this honest is in
[deployment.md](./deployment.md#the-bundle-check).

The **types** come from `pdfjs-dist` — a devDependency pinned to the version the
vendored build was copied from — through `import type`, which is erased at
compile time and so leaves both bundles exactly as they were. It earns its place
because the module itself arrives by runtime URL: hand-written structural types
are free to describe methods the real build does not have, and that is precisely
how a call to `PDFDocumentProxy.destroy()` — removed in pdf.js 6, cleanup having
moved to the loading task — passed `svelte-check` while throwing a **synchronous**
`TypeError` in every browser, for every PDF. Rename `task.destroy` to
`task.destroyy` and `bun run check` fails with "Property 'destroyy' does not exist
on type 'PDFDocumentLoadingTask'", which is the whole point of the import. They
remain a _promise_ about the vendored build rather than proof of it — nothing
checks the file on disk against the `.d.ts` — which is why the item join still
guards with a runtime `'str' in item` test.

Three smaller decisions in that module are easy to undo by accident:

- **Two caches, because the module alone is not enough.** One holds the ES
  module, the other the `PDFWorker` — `getDocument` starts a **fresh** worker for
  every call it is not handed one, so caching only the module left a contributor
  who picks six files spinning up six workers, each fetching, parsing and
  compiling pdf.js's 1.2 MB worker build. The cached worker is replaced whenever
  it reports `destroyed`, because `getDocument` handed a dead one rejects the
  loading task with `Worker was destroyed`, so a single stray `destroy()` would
  otherwise break every remaining extraction for the life of the page.
- **Each extraction destroys its own loading task** — not the document, and not
  the worker. `PDFDocumentLoadingTask.destroy()` is what releases that document
  and its page cache, and it tears down only a worker it created itself, so the
  shared one survives every pick. The call sits in a `try/catch` of its own
  inside the `finally`, which is not padding: **a throw in a `finally` destroys a
  _result_, not just a resource**, escaping past the value the `try` block has
  already computed and taking the extracted text with it. Leak the worker rather
  than lose the text.
- **`hasEOL` becomes a real newline**, not a space, because the de-hyphenation
  step below keys on `-\n`. Without the newline a line-broken `gravita-\ntion`
  indexes as two tokens.

`extractText` **never throws.** Every failure — an unreadable PDF, a missing
vendored build, a browser too old for the dynamic import — comes back as
`{status: 'error'}`, because the caller's job is to upload the file anyway and let
the row land `pending` for the backfill sweep. An exception here must never be the
reason an upload does not happen.

The caveat is that a catch that wide swallows **our own** bugs too, and it did:
the `TypeError` thrown out of `extractPdf`'s teardown was caught here and turned
into `{status: 'error'}` for every otherwise successful extraction, so the
pipeline reported unreadable PDFs while the text had in fact been computed and
thrown away. Swallowing is the contract; discarding the evidence never was part of
it. So the caught value is `console.error`ed with the file's name — the real name,
message and stack, pointing at the line — and `error` carries the parser's own
message to the contributor beside the friendly sentence, muted and monospaced so
it reads as machine output rather than as more prose.

A 900-page document bails out of the page loop once it is comfortably past the cap
rather than holding the editor for a minute to produce text that would be thrown
away.

### Normalisation, and why the order of its steps is fixed

`normalizeExtracted` in [`$lib/search.ts`](../src/lib/search.ts) is applied on
**three** paths — the browser, `uploadFile` on the server, and the backfill script
— and they must agree exactly, or the index and the snippet offsets disagree.

1. **`NFKC`** folds ligatures (`ﬁ` → `fi`) and full-width forms. One line for the
   classic PDF ligature bug, which otherwise leaves `find` unfindable.
2. **De-hyphenate line-broken words**, `(\p{Ll})-\n(\p{Ll})` → `$1$2`, and it must
   run **before** newlines collapse — afterwards there is no newline left to key
   on. Lowercase→lowercase only, so `X-\nray` fares better than a blanket rule
   would. It is a heuristic and will occasionally glue a genuine compound back
   together; that is the accepted trade for the far commoner justified-text case.
3. **Strip control and zero-width characters.** **Load-bearing for snippet safety
   and for trust**: this is what guarantees the U+0002/U+0003 snippet sentinels
   cannot occur in stored text, forged or otherwise. `\t`, `\n` and `\r` are
   deliberately spared so step 4 still sees word boundaries.
4. **Collapse whitespace and trim.**

Two things it deliberately does not do. **It does not lowercase** — `unicode61`
folds case for matching and the snippet should show real case. Note the contrast
with `getSearchIndex`, which _does_ lowercase because uFuzzy matches the raw
string, so nobody should "fix" the inconsistency. And **it does not strip math**:
`\alpha` indexes as the token `alpha`, which is useful.

`capExtracted` then cuts to `TEXT_CHAR_CAP` (512 000 chars) **on a whitespace
boundary** — cutting mid-word would put a spurious half-token into the index that
a prefix query would then match — and sets `truncated`, so a thin match set on a
very long document is explicable rather than a mystery.

### The write path

`FileSection.svelte` extracts on `change`, not on submit, and submits the result
as a hidden `extractedText` field in the same `FormData` as the file. In
`uploadFile`, `putFileText` is called **below the "nothing below this line may
fail the upload" line**: the object is already in R2 and the row already in D1, so
an `actionFail` here would tell the contributor their upload failed when it did
not. A missing, oversized or unparseable text therefore lands as a `pending` row
for the sweep — never as a failed upload.

`putFileText` maps every outcome to one upsert and never throws:

| cause                                                          | row                                            |
| -------------------------------------------------------------- | ---------------------------------------------- |
| ext not in `EXTRACTABLE_EXTS`                                  | `skipped`                                      |
| field absent or blank — old browser, JS off, extraction failed | `pending`                                      |
| over `MAX_SUBMITTED_TEXT_CHARS` (1 000 000)                    | `pending`, with `error` recorded               |
| normalises to under `MIN_EXTRACTED_CHARS` (32)                 | `empty` — **a scan**                           |
| otherwise                                                      | `ok` + text, chars, truncated, engine, version |

**`extractedText` is client-submitted, and that is the one real cost of extracting
in the browser.** Four things contain it, and they belong together:

1. **The trust boundary is unchanged.** Only `requireOlympiadEditor` reaches the
   action, and a contributor who wanted to poison search text could already upload
   a mislabelled file. This _widens an existing capability_ rather than granting a
   new one — a different thing, and worth saying plainly.
2. **The server re-runs `normalizeExtracted`.** Not tidiness: this is the security
   step. It is what strips the snippet sentinels so they cannot be forged into a
   result row's `matches`, and what applies the char cap.
3. **A hard size gate before the write**, well under D1's 2 MB row limit.
4. **The text never becomes HTML.** It leaves the server only as a bounded snippet,
   as plain text plus offsets — which is what keeps this from being an XSS question
   at all.

### What the contributor sees

This is where browser-side extraction pays its dividend, and it is worth stating
as a benefit rather than leaving it implicit: **the feedback arrives before the
upload, not after it.**

Because extraction has already run by the time the label is typed, the editor can
say "12 pages, 34 000 characters — searchable", or "**No text found.** This looks
like a scanned PDF; it will upload fine but won't be searchable", or "ZIPs aren't
searchable" straight from `isExtractable`. **A scan can be swapped for a text PDF
before anything is stored.** A server-side design could only ever have reported
that to an admin, later, as a counter.

The year editor also carries a quiet per-file badge from `getFileTextStatuses` —
nothing for `ok`, "no text" for `empty`, "not searchable" for `skipped`, "pending"
for a file the browser could not do. `/contribute` is uncached, so this is free.

## The index

`file_text` holds one row per uploaded document, keyed by **the whole CDN url**,
and `file_text_fts` is an external-content FTS5 virtual table over its `text`
column, kept in step by three triggers. The full argument for every choice —
why the url and not a row id, the five statuses, the missing foreign key, why
`db:generate` cannot see the FTS objects and why **`db:push` must never be pointed
at anything real** — is in
[data-model.md](./data-model.md#the-full-text-index). What matters for reading:

- **External content**, so `snippet()` is available and a tokenizer change is a
  `DROP`/`CREATE`/`'rebuild'` with **zero re-extraction**.
- **`prefix='2 3'`**, so `gravit*` is an index seek. A ⌘K box is nothing but
  prefix queries.
- **`remove_diacritics 2`**, which folds accents — it matters for translated
  papers.
- **No endpoint may select `file_text.text`.** Only `snippet()` reads it, inside
  the FTS5 query. Keeping that true is what stops the corpus becoming bulk
  downloadable, which is a copyright-adjacent question for third-party papers, and
  it is enforced simply by never exposing a query function that returns the column.

Four separate mechanisms keep the pieces in step: the **triggers** keep the index
in step with `file_text` for every writer, including a hand-run
`wrangler d1 execute`; **`extractor_version`** keeps `file_text` in step with the
pipeline; **`etag`/`bytes`** keep it in step with R2; and the **url join in the
read query** keeps results in step with the file tables with no cleanup dependency
at all.

## The query layer

Everything below lives in
[`$lib/server/db/queries/files.ts`](../src/lib/server/db/queries/files.ts) — a
module of its own rather than an extension of `content.ts`, which does tree
assembly for the frozen public shapes. A text index with a rank and an excerpt is
a different concern, and it is also where the query layer's **first raw `sql`**
lives.

### Sanitisation is a grammar problem, not an injection one

Nothing user-typed reaches `MATCH` as SQL — the expression is a bound parameter.
It is a **grammar** risk: FTS5 parses the bound string, and a bare `"`, `*`, `-`,
`NEAR`, `OR` or `(` is `SQLITE_ERROR: fts5: syntax error`, which means **a 500 on
ordinary input** like `e = mc^2` or `T1 - solutions`.

The defence is one line long: **every token becomes a double-quoted FTS5 string**,
which makes every operator inert, because FTS5 only recognises its keywords
unquoted. No escaping is needed inside the quotes, because `tokenize` has already
dropped everything that is not a letter, a digit or (inside a phrase) a space — a
`"` cannot survive into a token.

#### One query, a ladder of expressions

A query does not become one expression but an ordered **ladder** of them, most
precise first, which `searchFiles` walks until a rung returns a row. Precision and
recall get a rung each, because a single expression has to be both at once and can
only ever be one of them:

| rung     | expression                                  | built when                                                                         |
| -------- | ------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1 phrase | `"w1 w2 … wN"`, `*` on the last word        | ≥ 2 tokens and none of them quoted by the user; capped at `MAX_PHRASE_TOKENS` = 32 |
| 2 `AND`  | `"w1" AND … AND "wN"`, `*` on the last word | any token at all; capped at `MAX_DEEP_QUERY_TOKENS` = 24                           |
| 3 `OR`   | `"w1" OR … OR "wN"`, no `*`                 | ≥ 3 tokens — two would only restate rung 2 under a weaker operator; same cap       |

**Rung 1 is dropped the moment the user quotes something themselves.** An explicit
`"…"` is them saying where the phrase is, and re-grouping the whole query around a
phrase of our own would ignore that. Stopping at the first rung that matches is
the ranking rather than an optimisation: every rung is looser than the one above
it, so a phrase hit must never be diluted by the near misses the `OR` rung would
have added.

**Raising the token cap on its own is the obvious fix and the measurably wrong
one.** `two water reservoirs are separated by a vertical wall mn` is eleven
tokens. Cap one expression at eight and it stops narrowing: those first eight
words match five files from five different olympiads, none of them the one the
sentence was copied out of, where the whole sentence in quotes matches that one
file and nothing else. But ANDing the whole sentence matches **nothing at all**,
because the file it came from indexes `figure` as `gure` — the PDF emits U+0000
for the `fi` ligature and `normalizeExtracted` strips it with the rest of the
control characters. Every extra ANDed term is one more chance to hit a hole like
that, and one hole takes the result set to zero. The cap can therefore sit at 24
rather than 8 only **because over-constraining is recoverable** — the `OR` rung
catches it — where under-constraining never was.

**The trailing `*` on a phrase is a real prefix token**, and that piece of grammar
was checked against SQLite 3.53's FTS5 rather than assumed: `"two water reserv"*`
matches `two water reservoirs …`, where `"two water reserv"` matches nothing. It
is what keeps search-as-you-type from blanking on every keystroke in the middle of
a word.

**Rung 3 is not the desperate rung it looks like**, because bm25 ranks by coverage
and does it strongly. On that same sentence — where rungs 1 and 2 both come back
empty — the file it was copied out of ranks first at `-4.96` against the archive,
with `-0.73`, `-0.33` and `-0.000008` for the near misses: the right file, first,
by a wide margin, in exactly the case the narrower rungs cannot answer.

Those are scores against the **real corpus**, and the qualifier matters if anyone
re-measures. bm25 weights a term by how rare it is across the collection, so the
same query on a handful of documents produces different numbers with the same
_shape_ — a wide margin over the near misses. It is the margin that is the
argument, not the figure.

#### What a query becomes

One row per plan; a blank first cell continues the query above it.

| typed                  | plan                                                    |
| ---------------------- | ------------------------------------------------------- |
| `gravitation`          | `"gravitation"*`                                        |
| `mc^2 relativ`         | `"mc 2 relativ"*`                                       |
|                        | `"mc" AND "2" AND "relativ"*`                           |
|                        | `"mc" OR "2" OR "relativ"`                              |
| `"black hole" entropy` | `"black hole" AND "entropy"*` — quoted, so no rung 1    |
| `"black hol`           | `"black hol"` — open phrase, not extended               |
| `foo OR bar`           | `"foo or bar"*`                                         |
|                        | `"foo" AND "or" AND "bar"*` — `or` is a literal token   |
|                        | `"foo" OR "or" OR "bar"`                                |
| `-NEAR("a" b)`         | `"near" AND "a" AND "b"` — no `*`, `b` is one character |
|                        | `"near" OR "a" OR "b"`                                  |
| `???`                  | no plans at all → skip the query, empty results         |

Four details in there are deliberate:

- **An unbalanced trailing quote opens a phrase** rather than being dropped. The
  user is mid-phrase, and search-as-you-type must not go blank on the keystroke
  that types the quote.
- **Bare words split on anything that is not a letter or digit**, which is what
  `unicode61` does anyway — so `e=mc^2` yields `e`, `mc`, `2` here exactly as it
  does in the index.
- **Every cap keeps the _first_ N tokens**, not the last, so a plan stays stable
  as the user keeps typing.
- **The trailing prefix `*` goes on the last token only**, never on a single
  character — `a*` probes a large slice of the index for almost no signal — and
  never on a phrase the _user_ closed, because they said where it ended. That is a
  different thing from the `*` rung 1 puts on the phrase it builds itself, whose
  last word is bare by construction.

`AND` is written explicitly even though FTS5's implicit operator between two
strings is already AND, so the expression does not depend on that default.

There is deliberately **no `try/catch` swallowing an FTS error to `[]`** — that
would put an empty body for a query that should work into the shared cache for a
day. The sanitiser is the defence; observability is where a bug should surface.

### Four D1 queries, and why `snippet()` gets one to itself

`selectFtsHits` is **the only function in the codebase that knows the index's
shape.** Everything above it consumes `FtsHit[]`, so swapping FTS5 for something
else is a change to that one function.

It runs **two passes**. First the ranking, which selects rowids and nothing else:

```sql
SELECT file_text_fts.rowid AS id
FROM file_text_fts
JOIN file_text ft ON ft.id = file_text_fts.rowid AND ft.status = 'ok'
WHERE file_text_fts MATCH ?1
ORDER BY rank LIMIT ?2;
```

Then the snippets, for exactly those rowids:

```sql
SELECT ft.id AS id, ft.url AS url,
       snippet(file_text_fts, 0, char(2), char(3), '…', 16) AS snippet
FROM file_text_fts
JOIN file_text ft ON ft.id = file_text_fts.rowid AND ft.status = 'ok'
WHERE file_text_fts MATCH ?1 AND file_text_fts.rowid IN (?2, ?3, …);
```

**Pass 1 must never select `snippet()`, and that is the whole point.** This used
to be one CTE that took `snippet()` alongside `rank`, and in that form it read
**2,124 + 3 × limit** D1 rows per call — where 2,124 was exactly the number of
`status = 'ok'` rows in `file_text`. The fixed term was _independent of the
query_: a term matching two documents cost 2,130 rows, and two queries matching
402 and 469 documents both cost exactly 2,186. `snippet()` on an
**external-content** FTS5 table, evaluated in the same statement as an
unconstrained `MATCH`, walks the whole content table once whatever the `LIMIT` —
the `LIMIT` bounds the rows returned, not that walk. It made deep search the
single most expensive query in the archive, around a quarter of all rows read.

Constraining the cursor to known rowids makes fts5 seek instead of walk, and the
fixed term disappears:

|                                                    | rows read |
| -------------------------------------------------- | --------: |
| one statement, `snippet()` beside `rank`           |    ~2,186 |
| pass 1 — rowids in rank order, no `snippet()`      |       ~41 |
| pass 2 — `snippet()` constrained by `rowid IN (…)` |       ~63 |

~104 against ~2,186, for byte-identical snippets and ordering: about **21×**. Do
not fold these back into one statement to save a round trip — the round trip
costs ~3 ms and the fold costs ~2,100 rows.

The ladder changes how many statements a search costs, but not that shape, and it
is cheap for one reason: **a rung that matches nothing costs one statement, not
two**, because `selectFtsHits` returns before its snippet pass when the ranking
pass comes back empty — and a ranking pass measured ~20 rows for a query matching
402 documents. So the best case, a phrase hit, is the four queries above. The
**modal** case for a multi-word query is five, and it is worth naming rather than
reading the best case as typical: rung 1 asks for the words _adjacent_, which most
real queries are not, so the usual shape is one empty ranking pass, then rung 2's
two, then the two owner reads. The worst case, a query matching nothing at any
rung, is three ranking passes — ~60 rows — on top of the `hasFileText` read a
total miss already paid for its empty state.

`ORDER BY rank` still makes FTS5 score **every** matching document whatever the
`LIMIT`, and `MAX_DEEP_QUERY_TOKENS` remains the only control on that. Rung 3 is
the one rung where that matters — an `OR` matches far more documents than the
`AND` of the same words does — which is exactly why it runs last, and only once
the two narrower rungs have found nothing. Either way the scan reads the FTS index
rather than the content table, and D1 bills it as ~20 rows for a query matching
402 documents, so it is not where the money went.

**Rank order comes from pass 1 only.** Pass 2 is constrained by rowid and returns
rows in _rowid_ order, so its rows are folded into a map and re-emitted in pass
1's sequence; `rank` is never carried past pass 1, because the sequence _is_ the
score. Ordering the result by anything else — `id`, or pass 2's natural order —
silently discards bm25 and returns insertion order, **quietly falsifying the "the
array order IS the rank" contract** the whole response shape rests on.

**`status = 'ok'` is filtered in pass 1, before the `LIMIT`.** It used to be a
join in the outer half of the CTE — i.e. _after_ the `LIMIT` — so a non-`ok` row
inside the top window shrank the result set instead of being skipped over. That,
and not the dedupe its comment claimed, is what the old **×3 over-fetch** was
really compensating for: the ×3 made a shortfall unlikely rather than impossible,
and would still have under-filled had more than two thirds of a window been
non-`ok`. Filtering before the `LIMIT` returns exactly `limit` eligible rows, so
the index is now fetched **one row past the limit and no further** — that one row
exists only so `truncated` can tell "exactly 20" from "more than 20".

The join in pass 1 costs ~21 rows over a bare index scan, which is the price of
not depending on a distant invariant. Today no non-`ok` row _can_ match, because
`writeFileText` nulls `text` on any non-`ok` write and the trigger indexes
`coalesce(text, '')` — but nothing in the query would notice if that changed, and
the index's contract explicitly admits writers as blunt as a hand-run
`wrangler d1 execute`.

A row that appears in pass 1 but not pass 2 is **dropped**, which is what the old
join produced too, and the same degradation a url with no owning row already
gets: fewer results, never a wrong one. The two passes are separate statements
rather than one transaction, so a concurrent write between them can also drop a
row — harmless for the same reason.

`resolveOwners` then turns the kept urls into rows with **two parallel queries
folded into a map, not a `UNION`**. The two sides genuinely differ in shape — the
problem side carries `problems.number` and `title` — so a union would need null
padding plus a discriminator, and Drizzle's `unionAll` requires identical
projections anyway. `Promise.all` runs them concurrently, and the `Map` is needed
regardless, to collapse a multi-problem file into one hit. **Problem rows are
folded first**, so a url that is somehow both problem- and year-level keeps the
more specific label.

Each of those queries binds one parameter per url, and the snippet pass binds one
per rowid. At a limit of 20 both are nowhere near D1's 100-parameter cap — but
**raising the limit past ~90 means chunking**, in the snippet pass as well as
here, which is why the caller dedupes and truncates _before_ calling
`resolveOwners`.

**A url in the index with no owning row is dropped, not rendered.** D1 is the
authority on what exists, so a stale index degrades to fewer results rather than to
a dead link — which is also why the index needs no foreign key and why correctness
never depends on the three cleanup sites having run.

### The snippet: plain text plus offsets, never HTML

FTS5's `snippet()` wraps matches in markers of your choosing but **does not escape
the surrounding text** — and that text is extracted from contributor-uploaded
PDFs. Sending `<mark>`-marked HTML and rendering it through `{@html}` would be
**stored XSS on our own origin**: a PDF containing `<img onerror=…>` would execute.

The other marking path, `highlight()` in `fuzzy.ts`, _does_ reach `{@html}`, and
the two are safe for genuinely different reasons — which is the distinction to
hold on to, because "the text comes from our own database" is not one of them.
Those titles are typed by **contributors**, a real non-admin role; `sanitize-html`
runs only over olympiad descriptions, on the server; and `/api/search` sits in the
shared cache for a day. `highlight()` is the only thing between a title and the
DOM, so it **escapes every slice it emits and only then wraps the matched ones** —
on all three of its paths, the two that mark nothing included, because a field
does not have to match anything to be delivered. The escaping happens inside
uFuzzy's own walk rather than before the call, since the ranges index the
unescaped string and escaping first would shift every offset past the first `&`.
The snippet path needs none of that: it never produces markup at all.

So FTS5 marks with **ASCII STX/ETX** (`char(2)`/`char(3)`) and `splitSnippet`
turns them into `{snippet, matches}`:

- Controls are scrubbed and whitespace collapsed **before** the split, so the
  offsets already describe the exact string the client will slice. Neither pass can
  touch the markers: STX and ETX are excluded from the control range, and JS `\s`
  does not match them.
- The walk is an **indexed loop, not `for…of`**. The offsets are UTF-16 code-unit
  offsets because `String.prototype.slice` is what consumes them; iterating by code
  point would desync them on any astral character, and extracted PDF text is full
  of surprises.
- An unclosed range can only be a truncated snippet, so it is closed at the end.

On the client, `splitMarks` in `fuzzy.ts` turns those ranges into parts, and
**the container is validated as carefully as its contents**, both having crossed
the same wire: a `ranges` that is not an array degrades to one unmarked part,
because `for (const range of undefined)` throws inside a `$derived` and takes down
the whole result list rather than the one snippet it belongs to. Within it,
anything reversed, out of order, overlapping a range already emitted, or out of
bounds is _skipped_.

**A bad range is rejected, never repaired**, and those are not the same thing. A
start clamped forward to the cursor looks like a harmless no-op, but whatever
survives the clamp still gets marked — so a range that failed validation would go
on colouring characters as "this is what you searched for", claiming a match that
did not happen. Only the end is still clamped, downwards, because shortening a
range can only ever _unmark_ characters. The offsets crossed the wire, so a
server-side change must degrade to unmarked text — never to lost or duplicated
characters, never to a mark that was not earned, and never to a throw. Because the
parts are real elements, the template renders `<mark>` through the compiler and
nothing reaches `{@html}` at all.

### The response shape

```ts
type FileSearchResponse = {
	query: string; // the whole normalised query, phrases re-quoted, nothing dropped
	results: FileSearchResult[]; // best first. The array order IS the rank
	truncated: boolean;
	indexEmpty: boolean;
};
```

**`query` echoes the question, not the expression that answered it.** It is the
whole normalised query with phrases re-quoted and nothing capped, because a ladder
leaves no single expression to name — and echoing whichever rung happened to hit
would tell the user that words had been dropped when every word they typed is
still part of the question.

**There is no `rank` field, deliberately.** A bm25 float is an artefact of which
index was chosen — negative, unbounded, and meaningless if the index is ever
swapped, at which point the field would have to be faked to keep the shape. The
array is sorted; order is the rank. This is the single biggest thing keeping the
seam narrow.

It is an **envelope rather than a bare array**, unlike the four older public
shapes, because two flags have to travel. `truncated` drives the "showing the 20
best-matching files" footer. **`indexEmpty` is what lets a deploy before the
backfill finishes say "still indexing" instead of "no matches"** — it asks
`hasFileText` only when a query returned nothing, and it stays `false` for a query
that sanitised away, because then the reason there are no results is the query and
not the index.

### Cost controls, and the cache

In the order they bite:

| Control                 | Value | Effect                                                                                                                                                                                |
| ----------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MIN_DEEP_QUERY_LENGTH` | 5     | no D1 read below it; enforced on both sides                                                                                                                                           |
| `MAX_DEEP_QUERY_LENGTH` | 200   | refused before D1 _and_ before the cache header; enforced on both sides as well                                                                                                       |
| `MAX_DEEP_QUERY_TOKENS` | 24    | **the real control on the bm25 scan** — each token is one more index probe, and this is what keeps a pathological query inside D1's 30 s ceiling. It bites on the `OR` rung above all |
| `MAX_PHRASE_TOKENS`     | 32    | the phrase rung's own cap, deliberately looser: a longer phrase can only match _fewer_ documents, so what that rung asks of the index shrinks as the query grows                      |
| `DEEP_SEARCH_LIMIT`     | 20    | fetched **one row past**, never further; the shape of the snippet pass is what actually bounds rows read                                                                              |
| `normalizeDeepQuery`    | —     | `?q=Gravitation` and `?q=gravitation ` become one cache key                                                                                                                           |
| `DEEP_DEBOUNCE_MS`      | 250   | client-side; the first debounce in the codebase                                                                                                                                       |

Both bounds are refused **before any D1 work and before the cache header goes
on** — the same ordering `/api/olympiads/[olympiad]` uses for its 404. A 400 held
in the shared cache for a day would outlive the client bug that caused it. And
`setSharedCache` is called **after** the query succeeds, deliberately: an FTS
syntax error or a missing index table throws, and a 500 must not be cached.

The **upper** bound is mirrored on the client for a reason the lower one does not
have. The server answers an over-long query with a 400, and a 400 is a state the
panel can only render as "Couldn't search inside files.", beside a **Try again**
that re-fires the identical query and therefore can never succeed. An over-long
paste has to be answered by the dialog itself, in as many words, with the limit
and the length typed. The mirror **deliberately does not truncate** to the limit:
the cut would land mid-word, and a deep query's last token is prefix-extended in
the `MATCH`, so half a word would become a spurious `hal*` term and quietly change
which files come back. Refusing to ask is honest; asking a different question is
not.

`GET /api/search/files` takes **one parameter, `q`**, and every omission has its
own reason. Every accepted parameter multiplies cache keys; `status` is per-user
and must never touch `/api/`; and `topics`/`olympiad` are meaningless against a
file. A future `?topics=` should look wrong on sight. The handler **reads no cookie
and never touches `locals.user`**, which is what makes the body safe in a shared
cache — and why a future `?mine=1` would be a serious bug rather than a feature.

It is `GET`, not `POST`, because Cloudflare's cache key includes the query string
and a POST is uncacheable, which would turn every keystroke into a D1 read.

> **Its bodies are keyed by query string, so purge-by-URL cannot reach them.**
> Changing this endpoint's response shape means **Purge Everything** — and so does
> changing which files a query comes back with, which is a body change without a
> shape change and just as stale in the edge cache. There is no finite list of URLs
> to enumerate. Plan for that rather than discovering it; see
> [deployment.md](./deployment.md#purging-the-cache-after-an-api-change).

`AbortController` on the client saves bandwidth and ordering, not Worker work. The
real request-volume defences are the debounce, the minimum length, the normalised
key, the per-session cache and `s-maxage` at the edge.

## The client

### Why every piece of state lives in the shell

`Dialog.Content` sits inside bits-ui's `{#if shouldRender}`, so **its whole
subtree unmounts when the dialog closes.** State pushed into a child would be
rebuilt on every open, and the three session-long caches would quietly become a
fetch per keystroke of ⌘K. The `<svelte:window>` handler has to stay out there for
the same reason: it is what _opens_ the dialog, so it could never fire from inside
the content.

Three network resources, three fetch-once rules: the problem index on first open;
`/progress` on first open when signed in and again when `userId` changes; and the
deep-search cache once per distinct normalised query, ever. Each guard is only set
on **success**, so a failure retries on the next open rather than leaving the
session permanently unsearchable.

Success is not the only thing worth remembering, though, so each guard also
consults an **in-flight** flag. The "fetched" guards are set when a response
lands, so three ⌘K presses in quick succession re-ran the effects before the first
response arrived and fired `/api/search` three times over and `/progress` three
times with it — and `/progress` is `private, no-store` precisely so it is never
cached, which makes every one of those a real D1 read. Retry after a failure still
works, because both flags are false again by the time the `finally` has run. The
progress one holds a **user id** rather than a boolean, so a different user's map
is still fetched while one is in flight, where a boolean would have made it wait
for the next open.

**Those flags are plain non-reactive `let`s, and deliberately not the `$state`
loading cells that look like they would do the same job.** Both functions are
called synchronously from an `$effect`, so every `$state` cell they read becomes a
dependency of that effect — and the loading cells are written by the very function
the guard protects. Guarding on one would re-run the effect when the request
settled, and on the **failure** path nothing would stop the next run: the
"fetched" guard is still unset and the loading cell is false again, so the effect
would refetch, fail and refetch for as long as the dialog stayed open. The loading
cells stay `$state` because the markup reads them; the guards read the plain ones.

`userId` arrives **as a prop** from `+layout.svelte` rather than being read from
`$app/state`: `data` is a `$props()` read and so already reactive, and reading
`page.data.user` inside a `$lib` component would couple a shared component to the
root layout's load shape — which cannot even be typed from `$lib`.

### The `DeepSearch` class

[`deep-search.svelte.ts`](../src/lib/components/search/deep-search.svelte.ts)
holds the network behaviour — a class in a `.svelte.ts` module rather than five
more cells in the shell, with `Pending` in `$lib/forms.svelte.ts` as the
precedent. It is a plain `const` in the shell whose _fields_ are `$state`, so the
cache survives every open and close. The driving `$effect` deliberately stays in
the component: an effect can only be created during init, and the teardown-based
debounce depends on being one.

**The cache is a plain `Map`, and that is load-bearing rather than an oversight.**
A `SvelteMap` looks like the obvious choice — a response landing has to repaint —
but `has()` on an _absent_ key subscribes to the map's version, so caching any
query would invalidate every reader of any other key. The driving effect calls
`has()`, so an earlier query landing would tear that effect down and **abort the
request already in flight for the query the user is actually typing**, costing an
extra round trip per keystroke. Nothing needs the map to be reactive, because
nothing renders from a key other than `#landed`, which _is_ `$state`. Eviction is
insertion-order at `CACHE_LIMIT` = 30 (≈ 200 KB).

Three cells track what is on screen, in flight and failed, and **`null` is the
"none" sentinel, not `''`.** That is a fixed bug rather than a style choice: the
empty string is also the value of `deepQuery` when the input is empty, so with
`''` here `hasFailed('')` and `isLoading('')` both answered _true_ the moment
files mode opened, and the panel led with "Couldn't search inside files." before a
key had been pressed. A query the driving effect refuses to send — below the
minimum length, or above the maximum — is never fetched and never scheduled
either, so none of the three predicates may ever name one; `null` makes that
unrepresentable, where a guard in each predicate only makes it something every
future reader has to remember.

**The pending cell covers the debounce as well as the fetch**, which is what
`schedule(query)` and `unschedule(query)` are for. Setting it inside `run()`
alone would set it 250 ms late, because `run()` is what the debounce timer calls
— and for the whole time a first query is being typed there is then nothing
landed and nothing in flight, so the branch order below falls straight past
"Searching inside files…" into "No files contain that phrase.": an answer
asserted before the question has been asked. That shape hides itself well,
because once any non-empty list has landed that list is rendered instead.
`schedule` is called immediately above the `setTimeout`, and clears the failure
marker with it, because a failure must not outlive the decision to ask again;
`unschedule` is called from the same teardown as `clearTimeout`/`abort`, and
again from `run()`'s `finally`. **Both are identity-guarded**, and that guard is
the point rather than defensiveness: the teardown runs immediately before the
re-run that schedules the _next_ key, so an unconditional clear would wipe the
newer query's pending state and flash exactly the premature emptiness the pair
exists to prevent. `#token` cannot stand in for it, because a query still inside
its debounce has not taken a token yet.

`#landed` **deliberately trails the live query while a newer request is in
flight.** That is the whole anti-flicker mechanism: the panel keeps the last landed
list instead of blanking on every keystroke. Everything that could render a stale
marker compares against the _live_ key instead, so a marker left over from a query
the user has moved on from can never appear.

A monotonic `#token` is why a superseded response cannot rewind the panel.
`abort()` already stops one in almost every case, but a response whose `json()`
resolved before the abort landed would otherwise still apply — cheaper to make that
impossible than to reason about the window. `run()` caches its result **even when
it is no longer wanted** (it is still valid for that key, and backspacing back to
it must not cost a second request) and applies it to the panel only if the call is
still the newest. An `AbortError` is not a failure; it is us.

The explicit `res.ok` check matters for `fetchIndex`'s documented reason: an error
response with an HTML body makes `res.json()` throw, which escapes as an unhandled
rejection and leaves the panel claiming there are no files.

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

No timer state and no wrapper. Every dependency change re-runs the effect and the
teardown fires immediately before the re-run, so `clearTimeout` cancels a request
that had not gone out yet and `abort()` supersedes one that had.

**Every tracked read is synchronous and above the `setTimeout`.** Svelte only
registers dependencies read synchronously in the body, which is exactly what is
wanted — the fetch itself must create none, or landing a response would re-trigger
the request that produced it. `schedule()` and `unschedule()` are safe under that
same rule for the opposite reason: they only _write_ `DeepSearch`'s cells and read
none of them here, so they add no dependency and cannot re-trigger the effect.

### What the panel can show

**Non-flickering states are expressed by branch order, not flags:** too long →
failed → too short → (empty and loading) → genuinely empty → the list. So the
loading state can only appear when there is nothing worth keeping, and a newer
in-flight query merely _dims_ the last landed list (`opacity-60`, with
`motion-reduce:transition-none`) rather than emptying it.

**"Too long" sits above "failed" deliberately.** It is the one state that is never
sent, so it has to win over any marker a query that _was_ sent left behind —
otherwise the panel goes on reporting a failure for a question it has since
decided not to ask.

| State                 | Driven by                   | What shows                                                                     |
| --------------------- | --------------------------- | ------------------------------------------------------------------------------ |
| Too long              | `deepTooLong`               | "That's too long to search inside files.", with the length typed and the limit |
| Failed                | `deep.hasFailed(deepQuery)` | "Couldn't search inside files." + **Try again**                                |
| Idle / too short      | `deepQuery.length < MIN`    | the explainer, plus "type at least 5 characters" once anything has been typed  |
| Loading, nothing kept | `deepLoading` and no rows   | "Searching inside files…", from the keystroke rather than 250 ms after it      |
| Still indexing        | `deep.indexEmpty`           | "No files have been indexed yet — this is still catching up."                  |
| No matches            | rows empty, index non-empty | "No files contain that phrase."                                                |
| Results               | otherwise                   | the list, dimmed while stale                                                   |
| Truncated             | `deep.truncated`            | "Showing the 20 best-matching files"                                           |

The spinner **replaces** the magnifier in the input row rather than joining it: the
row has no width to spare.

`visibleDeepResults` is **not** simply `deep.results`. The two diverge in the
three states that render something else instead: a failure, a query backspaced
below the minimum, and a query pasted over the maximum. `deep.results` still holds
the last landed list in all of them, deliberately, because that is the cache and
re-typing must not cost a request; but nothing is rendered from it, so **the
keyboard must not address it either.** Without that, ArrowDown would move a
highlight over rows that are not there and Enter would open a file the user cannot
see. `resultCount` is derived from what is _rendered_, in both modes, which is the
invariant that keeps `focusedIndex` addressable — and the three conditions are
written in the panel's branch order on purpose, because the two have to agree and
reading them side by side is the cheapest way to keep them agreeing.

### Keyboard, activation and reset

- **⌘K** toggles the dialog, matched on `e.key.toLowerCase()`. With caps lock on —
  or shift held — `e.key` is `'K'`, and the plain `=== 'k'` this replaced silently
  stopped ⌘K working at all.
- **⌘⇧F** toggles the mode and returns focus to the input. Unbound in Chrome,
  Safari and Firefox — unlike ⌘⇧K, which is Firefox's Web Console — and the toggle
  button is Tab-reachable, so the chord is a convenience and never the only route.
- **Arrows drive the list only while focus is in the input** (`e.target !==
inputEl` returns early). Without that, an open filter dropdown moves _its_
  highlight and ours at the same time: `DropdownMenu` and `Dialog` both portal at
  `z-50` and both handlers see the key. Hovering a row does not move focus, so the
  hover-then-Enter contract is unaffected.
- ArrowDown clamps with `Math.max(resultCount - 1, 0)`: an empty list gives `-1`,
  which would park the index there until an ArrowUp recovered it.
- **The focused row is clamped on read, never written back.** `focused` is
  `resultCount === 0 ? 0 : Math.min(focusedIndex, resultCount - 1)`, and both
  lists' `focused=` props, the scroll-into-view, the Enter activation and both
  arrow expressions go through it; only hover, the arrows and the reset write
  `focusedIndex` itself. The list can shrink _under_ the index between the moment
  it is set and the moment it is used — hover row 18 of a stale twenty-row list,
  let a two-row response land, and Enter did nothing while ArrowUp needed
  seventeen presses to reach a real row, because the reset effect fires on
  `query`/`mode`/filter changes and a _response_ arriving for the query already
  typed goes through none of them. Clamping by writing `focusedIndex` back from an
  effect would be a derived-driven write to state that same derived reads, which
  is how the loops this file keeps warning about start; a clamp on read cannot
  loop, and cannot be forgotten by whoever adds the next branch that empties the
  list. Because the write target is still the raw index, a position parked beyond
  a briefly-short list is restored rather than destroyed when the list grows back.
- **`e.isComposing` returns early**, beside the `e.target !== inputEl` guard and
  **below** the two chords. While an IME is composing, Enter and the arrows belong
  to the candidate list: unguarded, the handler activates a result and closes the
  dialog on a keystroke that was only committing a word, and candidate arrows move
  both highlights at once. This archive's audience is international, so that is
  not an edge case. The placement is the rule — composition never involves
  ⌘/Ctrl, so no chord can be part of picking a candidate, and ⌘K in particular is
  how the dialog is closed again, so taking it away mid-composition would trap the
  user in the very state the guard exists to make usable.
- Rows are found by **`[data-result-index]`**, not `querySelectorAll('li')[i]`. The
  scroll container also holds a live region, a filter summary, the
  filters-don't-apply note and a footer, and any future non-result `<li>` would
  silently shift every index and land the highlight on the wrong row.
- **A file row's anchor is left completely alone** — `href` is the absolute CDN
  url with `target="_blank" rel="noopener noreferrer"`, and there is no
  `preventDefault` and no handler. The target is not an internal navigation, so the
  browser should handle the click, which is what keeps middle-click, ⌘-click and
  "Save link as" working. Enter therefore has no click to delegate to and calls
  `window.open` itself, with a same-tab fallback; silently doing nothing on Enter
  would be the worst outcome. **The dialog stays open** for a file, because it
  opened in a new tab and coming back should land on the same result list.
- **The olympiad name and year are deliberately not highlighted.** The query
  matched the file's _text_, not its metadata; marking the name would claim a match
  that did not happen.
- **Everything resets on `open`, not in an open/close function of ours.** The
  dialog can be opened three ways and closed four, and only two of those seven went
  through our code — before this, Escape followed by a click on the nav search
  button reopened the dialog with the previous query still in it. The mode resets
  for a stronger reason than the rest: deep search costs a round trip, and **⌘K
  must never start out hitting the network.** It resets what the user asked for and
  nothing they paid for — all three caches are untouched.

One coarse `role="status" aria-live="polite"` line carries a **count only**. A live
region echoing row contents would read the whole list out again on every keystroke.

## Operating the index

New uploads are indexed as they arrive. Everything already in R2 is swept up by
`bun run index:backfill`, whose full procedure — the `PHOXIV_SESSION` cookie, the
`__Secure-` prefix trap, where the bytes come from, and the corpus-size arithmetic
— is in [deployment.md](./deployment.md#backfilling-the-text-index).

The shape of it: `GET /admin/reindex` hands out the work queue and `POST` accepts
results, and **the Worker parses nothing in either direction.** `requireAdmin` is
called in the endpoint itself, not inherited — a `+server.ts` runs no layout loads.
The server re-runs `normalizeExtracted` on every posted text, exactly as
`uploadFile` does, for the same reason. There is deliberately **no batch action and
no batch button**: with the parsing outside there is nothing for the Worker to loop
over, which also sidesteps the infinite-submit-loop shape CLAUDE.md rule 8 records
in this exact panel.

**The work queue is derived, not stored** — no queue table and no cursor.
Processing a candidate writes its row, which removes it from the set, so idempotency
and resumability are free:

```sql
WITH files AS (SELECT url FROM year_files UNION SELECT url FROM problem_files)
SELECT f.url FROM files f LEFT JOIN file_text t ON t.url = f.url
WHERE t.id IS NULL                                          -- never seen
   OR (t.status IN ('pending','error') AND t.attempts < 3)   -- retryable
   OR t.extractor_version < ?1                               -- pipeline moved on
   OR (t.status = 'skipped' AND t.ext IN ?2)                 -- a wider extractor
```

Each clause earns its place. `attempts < 3` stops a poison file blocking the queue
forever — `writeFileText` increments it for the two retryable statuses and resets
it for the three terminal ones. `extractor_version` is what a bumped
`EXTRACTOR_VERSION` re-queues, with no migration. And the **`skipped` clause is
what lets a _wider_ extractor pick up what a narrower one passed on**: the browser
skips `.docx`/`.xlsx`, the local script can read them and passes its own extension
list, so those rows re-enter the queue for it alone — while a `.zip` is in nobody's
list and therefore converges to `skipped` forever, which is the point.

Because the candidate set **is** the file tables, files loaded out of band by
rclone — where the D1 rows are written independently — are picked up automatically.
An event-driven queue would miss them entirely.

The admin panel's Index tab is **read-only reporting** — counts by status, and up
to 50 failures — plus three maintenance actions:

| Action             | What it does                                                                                                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Rebuild index**  | `ensureFileTextIndex`: re-runs the FTS5 DDL with `IF NOT EXISTS`, then `'rebuild'`. The whole recovery story for the one hand-written migration, and it needs **no re-extraction** because the index is external-content |
| **Merge segments** | `('merge', 500)` rather than `('optimize')`, because optimize is a single unbounded statement and D1 caps a query at 30 seconds; merge does a bounded amount of work and can simply be run again                         |
| **Prune orphans**  | drops every row whose url no longer appears in either file table, and reports how many went                                                                                                                              |

One `index_files` activity-log row is written **per posted batch**, never per file:
`upload_file` already covers the single-file event, and per-file rows would flood
the log.

## Limits, and what is deliberately absent

Worth knowing before proposing a change, because each of these is a decision rather
than an omission:

- **A scanned PDF is not searchable.** There is no OCR. It lands `empty`, which is
  a first-class _visible_ state reported to the contributor before the upload and
  counted in the admin panel — not a failure.
- **No page offsets, so no deep link into a document.** pdf.js gives real page
  boundaries and the v2 path is cheap — a `pages` column of cumulative offsets and
  a `…problems.pdf#page=7` fragment, which browser PDF viewers honour — but it is
  not built.
- **`.zip` and legacy `.doc` are never indexed**; `.docx`/`.xlsx` only by the local
  script, never by the browser.
- **Deep search has no filters and cannot gain per-user ones.** Anything per-user
  must never touch `/api/`.
- **Problem search ships the whole corpus.** If it ever outgrows a single fetch,
  the first lever is deduping `olympiadName`/`olympiadIcon`, which repeat on every
  problem in the archive — a breaking shape change, and not needed yet.
- **Only one kind of result is on screen at a time**, because bm25 and uFuzzy's
  ordinal rank are incomparable.
- **A `<mark>` can land a character out on an exotic title.** uFuzzy computes its
  ranges against `text.toLowerCase()`, which is not length-preserving for every
  Unicode case pair. Cosmetic, and independent of the escaping that makes the
  `{@html}` around it safe.
- **The full ARIA combobox pattern is not implemented** —
  `role="combobox"` with `aria-expanded`/`aria-controls`/`aria-activedescendant`
  and rows as `role="option"`. It touches both item components, changes the `<ul>`
  semantics and has to be reconciled with bits-ui's focus trap, and half of it is
  worse than none.

The manual QA contract for all of this — there is no test suite — is in
[contributing.md](./contributing.md#the-gates).
