import type { FileSearchResponse, FileSearchResult } from '$lib/types.js';

/**
 * Deep search's network state: the per-session cache, what is on screen, and
 * the request in flight.
 *
 * Owned by `GlobalSearch.svelte`, because bits-ui unmounts the dialog's subtree
 * on close. The driving `$effect` stays in the component: effects can only be
 * created during init, and the debounce is that effect's teardown.
 */

/** One shared empty array, so downstream deriveds don't recompute per keystroke. */
const NO_RESULTS: readonly FileSearchResult[] = [];

/** 30 keys × ~20 hits × ~200 chars ≈ 200 KB. Evicted in insertion order. */
const CACHE_LIMIT = 30;

/**
 * The cache key for one deep search: the query and its olympiad scope. Both are
 * needed, or switching olympiad would serve the previous olympiad's results.
 *
 * `\n` can't occur in a normalised query, so keys can't collide. `null`
 * becomes '', which no id can be.
 */
export function deepCacheKey(query: string, olympiad: string | null): string {
	return `${olympiad ?? ''}\n${query}`;
}

export class DeepSearch {
	/**
	 * Every response this session, keyed by {@link deepCacheKey}.
	 *
	 * Must be a plain `Map`, not a `SvelteMap`. `has()` on a missing key would
	 * subscribe the driving effect to every write, so any response landing would
	 * rerun it and abort the request for the key being typed. Repaints go through
	 * `#landed` instead.
	 */
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- see above: a reactive map would abort in-flight requests
	#cache = new Map<string, FileSearchResponse>();

	/**
	 * The key whose results are on screen. It trails the live key while a newer
	 * request is in flight, so the panel doesn't blank on every keystroke. The
	 * predicates below compare against the live key, so stale markers never show.
	 *
	 * `null` means none. Don't use `''`: that is the empty input's key, and it
	 * made the panel show loading and failure states before anything was typed.
	 */
	#landed: string | null = $state(null);
	#inFlight: string | null = $state(null);
	#failed: string | null = $state(null);
	/** Bumped by "Try again", so the effect can re-fire the identical query. */
	#attempt = $state(0);

	/**
	 * Increments per request, so a superseded response (one whose `json()`
	 * resolved before the abort) can't overwrite the panel.
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

	/** Whether the panel is waiting on `key`, in the debounce or on the wire. */
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
	 * Marks `key` pending before the debounce starts. Otherwise, during the
	 * debounce, the panel would show "No files contain that phrase." before
	 * anything was asked.
	 */
	schedule(key: string): void {
		this.#inFlight = key;
		this.#failed = null;
	}

	/**
	 * Clears the pending marker, but only if `key` is still the pending one. The
	 * effect's teardown runs just before its rerun, and an abort rejects after
	 * the next key is scheduled; an unconditional clear would wipe the newer
	 * key's pending state.
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

	/** Clears what is on screen but keeps the cache, so a reopen costs nothing. */
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
	 * Fetches one key. `query` and `olympiad` are passed alongside `key` rather
	 * than parsed back out of it.
	 *
	 * The url omits `olympiad` when unfiltered and keeps a fixed parameter order,
	 * so each search has exactly one Cloudflare cache key.
	 *
	 * Check `res.ok` before `json()`: an HTML error body would throw and leave
	 * the panel claiming there are no files.
	 *
	 * The response is cached even if superseded (backspacing to it shouldn't
	 * refetch), but only shown if this is still the newest call. An `AbortError`
	 * is not a failure.
	 */
	async run(
		key: string,
		query: string,
		olympiad: string | null,
		signal: AbortSignal
	): Promise<void> {
		const token = ++this.#token;
		// Usually already set by `schedule`; kept so `run()` works on its own.
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
			// Via `unschedule`: the token can't see a newer key still in its
			// debounce, which has no token yet.
			if (token === this.#token) this.unschedule(key);
		}
	}
}
