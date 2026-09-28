/**
 * A JSON endpoint fetched from the browser: value, loading and failed.
 * Implements the fetching rules in docs/contributing.md:
 * - Check `res.ok` before `res.json()`, so an error page (e.g. a 403 after the
 *   session expires) shows as a failure, not as "no data".
 * - `loadOnce` remembers only successes, so a failure is retried, and joins a
 *   `loadOnce` already in flight rather than sending a second request.
 * - Only the newest call writes (`#seq`), so a refresh during the first fetch
 *   isn't lost.
 *
 * Not a general cache: no keys or dependency tracking. Pages whose URL changes
 * with route params handle that themselves.
 */
export class Resource<T> {
	#value = $state.raw<T | null>(null);
	#loading = $state(true);
	#failed = $state(false);

	// Plain fields, not $state: they're read inside callers' effects, and making
	// them reactive would make a failing fetch retry in a loop.
	#seq = 0;
	#loaded = false;
	#once: Promise<void> | null = null;

	readonly #url: () => string;

	/** @param url may be a getter; it is read on each call, not tracked. */
	constructor(url: string | (() => string)) {
		this.#url = typeof url === 'function' ? url : () => url;
	}

	/** The body, or `null` until one arrives. Replaced, never mutated. */
	get value(): T | null {
		return this.#value;
	}

	/** True only until the first body arrives, so a refresh doesn't flash a skeleton. */
	get loading(): boolean {
		return this.#loading;
	}

	/** True when the most recent attempt failed. Cleared by a later success. */
	get failed(): boolean {
		return this.#failed;
	}

	/**
	 * Fetch unless a previous fetch succeeded. Safe to call repeatedly, including
	 * from an `$effect` that reruns (the ⌘K dialog calls it on every open).
	 */
	loadOnce(): Promise<void> {
		if (this.#loaded) return Promise.resolve();
		this.#once ??= this.refresh().finally(() => (this.#once = null));
		return this.#once;
	}

	/** Fetch again, e.g. for a refresh button. */
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
			this.#loaded = true;
		} catch {
			if (mine === this.#seq) this.#failed = true;
		} finally {
			// In `finally`, so no error path can leave the page stuck on skeletons.
			if (mine === this.#seq) this.#loading = false;
		}
	}
}
