import { createContext } from 'svelte';
import { SvelteSet } from 'svelte/reactivity';
import { Resource } from '#lib/resource.svelte.js';
import { MARK_READ_MAX, type NotificationsPayload } from '#lib/announcements.js';

/**
 * Which announcements this visitor has seen, for the navbar bell and
 * /announcements. See docs/architecture.md, "Announcements and the bell".
 *
 * Signed in, the seen set lives on the account (`announcement_reads`, via
 * `/notifications`). Signed out, it lives in localStorage under {@link KEY}.
 * Not in a cookie: `(reg)` pages sit in the browser cache for 4h and couldn't
 * follow it. Whether someone is signed in comes from the endpoint's answer, not
 * from `data.user`, which a cached page can carry across a sign-in.
 *
 * At sign-in, the browser's set is merged into the account and then removed
 * from storage, so after signing out this browser starts afresh.
 *
 * One instance per page load, created by the root layout and shared through
 * context, rather than a module singleton whose state would be shared between
 * requests during SSR.
 */
export class Notifications {
	#resource = new Resource<NotificationsPayload>('/notifications');
	/** Seen on the account. Only ever grows; seeded from each endpoint answer. */
	#server = new SvelteSet<number>();
	/** Seen in this browser while signed out, mirrored to localStorage. */
	#local = new SvelteSet<number>();
	#hydrated = false;

	/** The newest announcements, for the bell. Empty until the fetch lands. */
	readonly announcements = $derived(this.#resource.value?.announcements ?? []);

	/** `null` until the endpoint has answered. */
	readonly signedIn = $derived(
		this.#resource.value === null ? null : this.#resource.value.read !== null
	);

	readonly loading = $derived(this.#resource.loading);
	readonly failed = $derived(this.#resource.failed);

	/** Unread among the bell's announcements, the count on its chip. */
	readonly unreadCount = $derived(
		this.signedIn === null ? 0 : this.announcements.filter((a) => !this.isRead(a.id)).length
	);

	/**
	 * Whether `id` has been seen, by whichever store applies. Signed in, this
	 * only knows the bell's announcements plus anything marked since;
	 * /announcements takes the rest from its own load.
	 */
	isRead(id: number, signedIn: boolean | null = this.signedIn): boolean {
		return signedIn ? this.#server.has(id) : this.#local.has(id);
	}

	/**
	 * Reads the browser's set from storage. Idempotent, and browser-only: call it
	 * from `onMount`. A page's `onMount` runs before the layout's, so
	 * /announcements calls it too rather than waiting for {@link load}.
	 */
	hydrate(): void {
		if (this.#hydrated) return;
		this.#hydrated = true;
		for (const id of readStored()) this.#local.add(id);
	}

	/**
	 * Fetches the bell's announcements once per page load (the layout survives
	 * client-side navigation), then, if signed in, merges in anything this
	 * browser saw while signed out.
	 */
	async load(): Promise<void> {
		this.hydrate();
		await this.#resource.loadOnce();
		const read = this.#resource.value?.read;
		if (!read) return;
		for (const id of read) this.#server.add(id);

		const pending = [...this.#local].filter((id) => !this.#server.has(id));
		if (pending.length === 0) {
			if (this.#local.size > 0) this.#clearLocal();
			return;
		}
		for (const id of pending) this.#server.add(id);
		// Only cleared once the account has them; a failure retries next load.
		if (await postRead(pending)) this.#clearLocal();
	}

	/**
	 * Records `ids` as seen. `signedIn` defaults to what the endpoint said; a
	 * page that knows better from its own `no-store` load passes it, since it
	 * may run before the bell's fetch has landed.
	 *
	 * Best effort when signed in: if the POST fails, the announcements show as
	 * unread again on the next page load.
	 */
	markViewed(ids: number[], signedIn: boolean | null = this.signedIn): void {
		if (signedIn === null) return;
		if (signedIn) {
			const fresh = ids.filter((id) => !this.#server.has(id));
			if (fresh.length === 0) return;
			for (const id of fresh) this.#server.add(id);
			void postRead(fresh);
		} else {
			this.hydrate();
			const fresh = ids.filter((id) => !this.#local.has(id));
			if (fresh.length === 0) return;
			for (const id of fresh) this.#local.add(id);
			writeStored([...this.#local]);
		}
	}

	#clearLocal(): void {
		this.#local.clear();
		try {
			localStorage.removeItem(KEY);
		} catch {
			// Blocked storage: nothing was stored either.
		}
	}
}

export const [getNotifications, setNotifications] = createContext<Notifications>();

const KEY = 'phoxiv:announcements-read';

/**
 * Most ids kept in storage. Ids only grow, so the newest are the largest; old
 * ones have long since left the bell.
 */
const STORED_MAX = 200;

/** The stored set, or `[]` when there is none, it's corrupt, or storage is blocked. */
function readStored(): number[] {
	try {
		const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
		return Array.isArray(parsed)
			? parsed.filter((id): id is number => Number.isInteger(id) && id > 0)
			: [];
	} catch {
		return [];
	}
}

/** Stores the newest {@link STORED_MAX} ids. With storage blocked they last until the page is left. */
function writeStored(ids: number[]): void {
	try {
		const newest = ids.sort((a, b) => b - a).slice(0, STORED_MAX);
		localStorage.setItem(KEY, JSON.stringify(newest));
	} catch {
		// Private mode or blocked site data: nothing to do.
	}
}

/** POSTs `ids` in batches the endpoint accepts. `true` only if every batch succeeded. */
async function postRead(ids: number[]): Promise<boolean> {
	let allOk = true;
	for (let i = 0; i < ids.length; i += MARK_READ_MAX) {
		try {
			const res = await fetch('/notifications', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ ids: ids.slice(i, i + MARK_READ_MAX) })
			});
			if (!res.ok) allOk = false;
		} catch {
			allOk = false;
		}
	}
	return allOk;
}
