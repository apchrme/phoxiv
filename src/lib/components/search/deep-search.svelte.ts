import type { FileSearchResponse, FileSearchResult } from '$lib/types.js';

/**
 * Deep search's network behaviour: the per-session cache, what is on screen, and
 * the one request in flight.
 *
 * A class in a `.svelte.ts` module rather than five more cells in
 * `GlobalSearch.svelte`, for the reason that component's own header gives:
 * everything stateful has to live in the shell, because bits-ui unmounts the
 * dialog's subtree on close. A single `const deep = new DeepSearch()` satisfies
 * that while keeping the debounce, the abort, the cache and the retry in one
 * readable place. The precedent is `Pending` in `$lib/forms.svelte.ts`.
 *
 * The driving `$effect` deliberately stays in the component: an effect can only
 * be created during init, and the teardown-based debounce depends on being one.
 */

/**
 * One shared empty array, so `results` keeps referential identity while nothing
 * has landed and downstream deriveds do not recompute on every keystroke.
 */
const NO_RESULTS: readonly FileSearchResult[] = [];

/**
 * 30 keys × ~20 hits × ~200 chars ≈ 200 KB. Evicted in insertion order.
 *
 * A key is now a **(query, olympiad) pair** rather than a query, so the key
 * space is roughly (olympiads + 1)× larger and a session that switches filter
 * repeatedly reaches this cap sooner. Still generous: 30 keys is far more than a
 * single ⌘K session types, and the cost of an eviction is one request.
 */
const CACHE_LIMIT = 30;

/**
 * The cache key for one deep search: a query **and** the olympiad it was scoped
 * to.
 *
 * **Keying on the query alone was a correctness bug waiting for this feature.**
 * `#cache`, `#landed`, `#inFlight` and `#failed` are all keyed by this string, so
 * with the query alone, switching olympiad would serve the previous olympiad's
 * results straight out of the session cache and never ask the server.
 *
 * `\n` is the separator because {@link normalizeDeepQuery} collapses every run of
 * whitespace to single spaces, so a normalised query can never contain one — the
 * composition is injective, and no (olympiad, query) pair can collide with
 * another. `null` composes as the empty string, which no id can be.
 *
 * Every method here keeps taking a single opaque `key`, so nothing inside this
 * class knows the pair exists; `run()` is the one place that needs both halves,
 * and it takes them separately to build the url.
 */
export function deepCacheKey(query: string, olympiad: string | null): string {
	return `${olympiad ?? ''}\n${query}`;
}

export class DeepSearch {
	/**
	 * Every response this session has received, keyed by {@link deepCacheKey}.
	 *
	 * **A plain `Map`, and that is load-bearing rather than an oversight.** A
	 * `SvelteMap` looks like the obvious choice — a response landing has to
	 * repaint — but `has()` on an *absent* key subscribes to the map's version, so
	 * caching any key invalidates every reader of any other key. The driving
	 * effect in `GlobalSearch.svelte` calls `has()`, so an earlier key landing
	 * would tear that effect down and **abort the request already in flight for
	 * the key the user is actually typing**, costing an extra round trip per
	 * keystroke.
	 *
	 * Nothing needs the map to be reactive, because nothing renders from a key
	 * other than `#landed`, which *is* `$state` and is only ever set once the entry
	 * beside it exists. Every repaint travels through that cell instead.
	 */
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- see above: a reactive map would abort in-flight requests
	#cache = new Map<string, FileSearchResponse>();

	/**
	 * The key whose results are on screen.
	 *
	 * **It deliberately trails the live key while a newer request is in
	 * flight.** That is the whole anti-flicker mechanism: the panel keeps the last
	 * landed list instead of blanking on every keystroke. Everything that could
	 * render a stale marker — {@link isLoading}, {@link hasFailed},
	 * {@link isStale} — compares against the *live* key instead, so a marker left
	 * over from a key the user has moved on from can never appear.
	 *
	 * **`null` is the "none" sentinel, not `''`, and that is a fixed bug rather
	 * than a style choice.** The empty string is also the value of `deepQuery`
	 * when the input is empty — and so a prefix of every key — so with `''` here
	 * `hasFailed('')` and
	 * `isLoading('')` both answered *true* the moment files mode opened, and the
	 * panel led with "Couldn't search inside files." before a key had been
	 * pressed. A query the driving effect refuses to send — shorter than
	 * `MIN_DEEP_QUERY_LENGTH`, or longer than `MAX_DEEP_QUERY_LENGTH` — is never
	 * scheduled either, so none of these three may ever name one; `null` makes
	 * that unrepresentable, where a guard in each predicate only makes it
	 * something every future reader has to remember. `isStale` carried such a
	 * guard; the other two did not.
	 */
	#landed: string | null = $state(null);
	#inFlight: string | null = $state(null);
	#failed: string | null = $state(null);
	/** Bumped by "Try again", so the effect can re-fire the identical query. */
	#attempt = $state(0);

	/**
	 * Monotonic, and the reason a superseded response cannot rewind the panel.
	 *
	 * `abort()` already stops one in almost every case, but a response whose
	 * `json()` resolved before the abort landed would otherwise still apply.
	 * Cheaper to make that impossible than to reason about the window.
	 */
	#token = 0;

	get attempt(): number {
		return this.#attempt;
	}

	/** The body on screen, if anything is. */
	get #current(): FileSearchResponse | undefined {
		return this.#landed === null ? undefined : this.#cache.get(this.#landed);
	}

	/** Best-first hits for whatever last landed, or the shared empty array. */
	get results(): readonly FileSearchResult[] {
		return this.#current?.results ?? NO_RESULTS;
	}

	/** More files matched than were returned, for the footer. */
	get truncated(): boolean {
		return this.#current?.truncated ?? false;
	}

	/** The index holds nothing at all — "still indexing", not "no matches". */
	get indexEmpty(): boolean {
		return this.#current?.indexEmpty ?? false;
	}

	/** Whether `key` has already been fetched this session. Not reactive. */
	has(key: string): boolean {
		return this.#cache.has(key);
	}

	/**
	 * Whether `key` is the one the panel is waiting on — **either sitting out
	 * the debounce or actually on the wire**; see {@link schedule}.
	 *
	 * `key` is always a string and the cell is `null` when idle, so an empty
	 * input matches nothing here without a length check of its own.
	 */
	isLoading(key: string): boolean {
		return this.#inFlight === key;
	}

	/** Whether `key` failed and has not since succeeded. */
	hasFailed(key: string): boolean {
		return this.#failed === key;
	}

	/** Whether what is on screen belongs to an older key than `key`. */
	isStale(key: string): boolean {
		return this.#landed !== null && this.#landed !== key;
	}

	/**
	 * Marks `key` as pending **before** the debounce timer starts.
	 *
	 * `#inFlight` used to be set only inside {@link run}, which the driving effect
	 * calls `DEEP_DEBOUNCE_MS` (250 ms) after the last keystroke — so while a first
	 * query was being typed `isLoading()` was false with nothing landed, and the
	 * panel's branch order fell past "Searching inside files…" straight into "No
	 * files contain that phrase.": an answer asserted before the question had been
	 * asked. The pending state therefore covers the debounce as well as the fetch.
	 * It hid itself well, because once any non-empty list has landed that list is
	 * rendered instead.
	 *
	 * `#failed` is cleared here rather than only in `run()` for the same reason: a
	 * failure marker must not outlive the decision to ask again.
	 */
	schedule(key: string): void {
		this.#inFlight = key;
		this.#failed = null;
	}

	/**
	 * Drops the pending marker {@link schedule} set — **only if `key` is still
	 * the pending one**.
	 *
	 * The guard is the whole point, not defensiveness. The driving effect's
	 * teardown runs immediately before its re-run, so an unconditional clear would
	 * wipe the *newer* key's pending state that the re-run is about to set, and
	 * the panel would flash exactly the premature "No files contain that phrase."
	 * this pair exists to prevent. `run()`'s `finally` clears through here for the
	 * same reason: an abort rejects a microtask *after* the next key has been
	 * scheduled, and `#token` cannot see that, because a key still inside its
	 * debounce has not taken a token yet.
	 */
	unschedule(key: string): void {
		if (this.#inFlight === key) this.#inFlight = null;
	}

	/** Shows an already-cached key synchronously. Never a network event. */
	show(key: string): void {
		if (!this.#cache.has(key)) return;
		this.#token++;
		this.#inFlight = null;
		this.#failed = null;
		this.#landed = key;
	}

	/** Re-fires the current query after a failure. */
	retry(): void {
		this.#failed = null;
		this.#attempt++;
	}

	/** Clears what is on screen but **keeps the cache**, so a reopen costs nothing. */
	reset(): void {
		this.#token++;
		this.#landed = null;
		this.#inFlight = null;
		this.#failed = null;
	}

	#remember(key: string, body: FileSearchResponse): void {
		if (this.#cache.size >= CACHE_LIMIT) {
			const oldest = this.#cache.keys().next();
			if (!oldest.done) this.#cache.delete(oldest.value);
		}
		this.#cache.set(key, body);
	}

	/**
	 * Fetches one key.
	 *
	 * `key` is what everything here is stored under; `query` and `olympiad` are
	 * its two halves, passed separately because only the url needs them apart.
	 * They are **not** re-derived from `key` — splitting a composed string back
	 * open is exactly the kind of thing that stops being injective when someone
	 * changes the separator.
	 *
	 * The url omits `olympiad` entirely when unfiltered rather than sending it
	 * empty: `?q=x&olympiad=` and `?q=x` are two Cloudflare cache keys holding one
	 * body. The parameter order is fixed at `?q=…&olympiad=…` for the same reason
	 * — Cloudflare does not sort a query string before keying on it.
	 *
	 * The explicit `res.ok` check is `fetchIndex`'s documented rule and matters for
	 * the same reason: an error response with an HTML body makes `res.json()`
	 * throw, which escapes as an unhandled rejection and leaves the panel claiming
	 * there are no files.
	 *
	 * The result is cached **even when it is no longer wanted** — it is still valid
	 * for that key, and backspacing back to it must not cost a second request — but
	 * it is applied to the panel only if this call is still the newest.
	 *
	 * An `AbortError` is not a failure. It is us.
	 */
	async run(
		key: string,
		query: string,
		olympiad: string | null,
		signal: AbortSignal
	): Promise<void> {
		const token = ++this.#token;
		// Normally a no-op: the driving effect has already scheduled this key. Kept
		// so `run()` is correct on its own rather than only in that one caller.
		this.#inFlight = key;
		this.#failed = null;

		try {
			const scope = olympiad === null ? '' : `&olympiad=${encodeURIComponent(olympiad)}`;
			const res = await fetch(`/api/search/files?q=${encodeURIComponent(query)}${scope}`, {
				signal
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const body: FileSearchResponse = await res.json();
			this.#remember(key, body);
			if (token !== this.#token) return;
			this.#landed = key;
		} catch (e) {
			if (e instanceof DOMException && e.name === 'AbortError') return;
			if (token !== this.#token) return;
			this.#failed = key;
		} finally {
			// Through `unschedule` rather than a bare assignment: the token alone
			// cannot tell that a newer key is already pending inside its debounce,
			// having taken no token yet. See that method.
			if (token === this.#token) this.unschedule(key);
		}
	}
}
