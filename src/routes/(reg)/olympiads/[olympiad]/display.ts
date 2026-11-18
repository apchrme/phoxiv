/**
 * How the olympiad page lays out problems without files, remembered per browser.
 *
 * - `'grouped'`: one-line rows in a collapsible section under the cards.
 * - `'cards'`: a card each, in order among the problems with files.
 *
 * Kept in `localStorage`, not on the account, so it works signed out, and not in
 * a cookie, because the page's HTML sits in the browser's private cache for 4h
 * and couldn't follow a change to it. The problems are fetched after hydration,
 * so reading the choice in the browser doesn't flash the other layout.
 */
export type ProblemDisplay = 'grouped' | 'cards';

const KEY = 'phoxiv:olympiad-display';

/** The stored choice, or `'grouped'` when there is none or storage is blocked. */
export function loadDisplay(): ProblemDisplay {
	try {
		return localStorage.getItem(KEY) === 'cards' ? 'cards' : 'grouped';
	} catch {
		return 'grouped';
	}
}

/** Stores the choice. With storage blocked it lasts until the page is left. */
export function saveDisplay(display: ProblemDisplay): void {
	try {
		localStorage.setItem(KEY, display);
	} catch {
		// Private mode or blocked site data: nothing to do.
	}
}
