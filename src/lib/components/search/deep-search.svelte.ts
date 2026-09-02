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

/** 30 queries × ~20 hits × ~200 chars ≈ 200 KB. Evicted in insertion order. */
const CACHE_LIMIT = 30;

export class DeepSearch {
	/**
	 * Every response this session has received, keyed by normalised query.
	 *
	 * **A plain `Map`, and that is load-bearing rather than an oversight.** A
	 * `SvelteMap` looks like the obvious choice — a response landing has to
	 * repaint — but `has()` on an *absent* key subscribes to the map's version, so
	 * caching any query invalidates every reader of any other key. The driving
	 * effect in `GlobalSearch.svelte` calls `has()`, so an earlier query landing
	 * would tear that effect down and **abort the request already in flight for
	 * the query the user is actually typing**, costing an extra round trip per
	 * keystroke.
	 *
	 * Nothing needs the map to be reactive, because nothing renders from a key
	 * other than `#landed`, which *is* `$state` and is only ever set once the entry
	 * beside it exists. Every repaint travels through that cell instead.
	 */
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- see above: a reactive map would abort in-flight requests
	#cache = new Map<string, FileSearchResponse>();

	/**
	 * The query whose results are on screen.
	 *
	 * **It deliberately trails the live query while a newer request is in
	 * flight.** That is the whole anti-flicker mechanism: the panel keeps the last
	 * landed list instead of blanking on every keystroke. Everything that could
	 * render a stale marker — {@link isLoading}, {@link hasFailed},
	 * {@link isStale} — compares against the *live* key instead, so a marker left
	 * over from a query the user has moved on from can never appear.
	 *
	 * **`null` is the "none" sentinel, not `''`, and that is a fixed bug rather
	 * than a style choice.** The empty string is also the value of `deepQuery`
	 * when the input is empty, so with `''` here `hasFailed('')` and
	 * `isLoading('')` both answered *true* the moment files mode opened, and the
	 * panel led with "Couldn't search inside files." before a key had been
	 * pressed. A query below `MIN_DEEP_QUERY_LENGTH` is never fetched, so none of
	 * these three may ever name one — `null` makes that unrepresentable, where a
	 * guard in each predicate only makes it something every future reader has to
	 * remember. `isStale` carried such a guard; the other two did not.
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

	/** Whether `query` has already been fetched this session. Not reactive. */
	has(query: string): boolean {
		return this.#cache.has(query);
	}

	/**
	 * Whether `query` is the one currently on the wire.
	 *
	 * `query` is always a string and the cell is `null` when idle, so an empty
	 * input matches nothing here without a length check of its own.
	 */
	isLoading(query: string): boolean {
		return this.#inFlight === query;
	}

	/** Whether `query` failed and has not since succeeded. */
	hasFailed(query: string): boolean {
		return this.#failed === query;
	}

	/** Whether what is on screen belongs to an older query than `query`. */
	isStale(query: string): boolean {
		return this.#landed !== null && this.#landed !== query;
	}

	/** Shows an already-cached query synchronously. Never a network event. */
	show(query: string): void {
		if (!this.#cache.has(query)) return;
		this.#token++;
		this.#inFlight = null;
		this.#failed = null;
		this.#landed = query;
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

	#remember(query: string, body: FileSearchResponse): void {
		if (this.#cache.size >= CACHE_LIMIT) {
			const oldest = this.#cache.keys().next();
			if (!oldest.done) this.#cache.delete(oldest.value);
		}
		this.#cache.set(query, body);
	}

	/**
	 * Fetches one query.
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
	async run(query: string, signal: AbortSignal): Promise<void> {
		const token = ++this.#token;
		this.#inFlight = query;
		this.#failed = null;

		try {
			const res = await fetch(`/api/search/files?q=${encodeURIComponent(query)}`, { signal });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const body: FileSearchResponse = await res.json();
			this.#remember(query, body);
			if (token !== this.#token) return;
			this.#landed = query;
		} catch (e) {
			if (e instanceof DOMException && e.name === 'AbortError') return;
			if (token !== this.#token) return;
			this.#failed = query;
		} finally {
			if (token === this.#token) this.#inFlight = null;
		}
	}
}
