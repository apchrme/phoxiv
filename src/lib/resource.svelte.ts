/**
 * A JSON endpoint the browser reads: its value, whether it is still coming, and
 * whether it failed.
 *
 * Six places fetched a `/api/*` body on mount and wrote the same three cells —
 * value, loading, failed — around it, and the copies had already drifted. Some
 * cleared `loading` in a `finally` and some in each branch, which is not a style
 * question: the olympiads page once let a rejection escape and sat on six
 * skeletons forever. That comment is now this class's `finally`.
 *
 * # What it encodes
 *
 * [contributing.md](../../docs/contributing.md) states three rules for
 * browser-side fetching and this exists so that each is written once:
 *
 * - **`res.ok` is checked before `res.json()`.** An error response with an HTML
 *   body makes `json()` throw, which escapes as an unhandled rejection and
 *   leaves the UI claiming there is no data instead of reporting a failure. A
 *   403 here is live rather than hypothetical — a session can expire while a page
 *   sits open.
 * - **The fetch-once guard is set only on success**, so a failure retries on the
 *   next attempt rather than breaking the page for the rest of the session.
 * - **A separate in-flight flag sits beside it**, a plain `let` and not a `$state`
 *   cell, because both guards are read synchronously from an `$effect`: a
 *   reactive one would make the effect depend on what it writes and, on the
 *   failure path, refetch and fail again for as long as the page stayed open.
 *
 * # What it does not encode
 *
 * `#seq` makes every call safe to run concurrently while letting only the newest
 * write, which is what a refreshable panel needs and what a boolean in-flight
 * guard cannot give it: a boolean would silently drop a refresh issued while the
 * mount fetch was still running, leaving the numbers permanently wrong. It is a
 * plain `let` for the reason above.
 *
 * It is **not** a general async-state library. It deliberately has no key, no
 * cache and no dependency tracking: `(reg)/olympiads/[olympiad]` refetches when
 * its route parameter changes and has to discard a response the reader has
 * already navigated away from, which is a different contract — one about
 * *identity*, not freshness — and folding both in would give this class a second
 * meaning and dilute the incident comments recording the first.
 */
export class Resource<T> {
	#value = $state.raw<T | null>(null);
	#loading = $state(true);
	#failed = $state(false);

	/** See the header: only the newest call writes, and neither flag is reactive. */
	#seq = 0;
	#loaded = false;

	readonly #url: () => string;

	/**
	 * @param url a getter, so a caller can build the path from reactive state.
	 *   It is read once per call, not tracked.
	 */
	constructor(url: string | (() => string)) {
		this.#url = typeof url === 'function' ? url : () => url;
	}

	/** The body, or `null` until one lands. `$state.raw`: replaced wholesale, never mutated. */
	get value(): T | null {
		return this.#value;
	}

	/**
	 * True while the *first* body is still coming.
	 *
	 * Deliberately false during a refresh that has something to show. A panel that
	 * blanked to a skeleton on every maintenance click would flicker; the
	 * anti-flicker contract the search dialog and the index panel both keep is
	 * that a newer request dims the last landed value rather than replacing it.
	 */
	get loading(): boolean {
		return this.#loading;
	}

	/** True when the most recent attempt failed. Cleared by a later success. */
	get failed(): boolean {
		return this.#failed;
	}

	/** Fetch once, ever — unless the previous attempt failed. Safe to call repeatedly. */
	async loadOnce(): Promise<void> {
		if (this.#loaded) return;
		await this.refresh();
	}

	/** Fetch again, whatever happened before. For a panel with a refresh button. */
	async refresh(): Promise<void> {
		const mine = ++this.#seq;
		this.#loading = this.#value === null;
		try {
			const res = await fetch(this.#url());
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const next: T = await res.json();
			if (mine !== this.#seq) return;
			this.#value = next;
			this.#failed = false;
			// Set only on success, so a failure is retried rather than remembered.
			this.#loaded = true;
		} catch {
			if (mine === this.#seq) this.#failed = true;
		} finally {
			// In `finally` and not in each branch: letting a rejection escape here is
			// what once left the olympiads page showing six skeletons forever.
			if (mine === this.#seq) this.#loading = false;
		}
	}
}
