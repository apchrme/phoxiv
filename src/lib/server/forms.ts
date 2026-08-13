import { fail, type ActionFailure } from '@sveltejs/kit';

/**
 * Form-field parsing and the shape every form action returns.
 *
 * # The action-result envelope
 *
 * Every action in the app resolves to exactly one of two shapes:
 *
 * ```
 * { action: 'uploadFile', success: true }                  // + any extra payload
 * { action: 'uploadFile', success: false, error: '...' }
 * ```
 *
 * Because `success` is a literal `true`/`false`, the `form` union SvelteKit
 * generates in `./$types` is a discriminated union — first on `success`, then on
 * `action`. A page can therefore write `if (!form.success) toast.error(form.error)`
 * and narrow payload fields by checking `form.action`, with no `'x' in form`
 * probing. `$lib/forms.svelte.ts` builds the client-side toast handling on top
 * of this contract, so the two must change together.
 *
 * Actions that end in `redirect()` never return, and so never appear in the
 * union.
 */

/** Result of a validation step that either yields a value or a message. */
export type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

export type ActionOk<A extends string, D = unknown> = { action: A; success: true } & D;
export type ActionErr<A extends string> = { action: A; success: false; error: string };

/** A successful action result, optionally carrying a payload for the page. */
export function ok<A extends string>(action: A): ActionOk<A>;
export function ok<A extends string, D extends Record<string, unknown>>(
	action: A,
	data: D
): ActionOk<A, D>;
export function ok<A extends string>(action: A, data?: Record<string, unknown>) {
	return { action, success: true as const, ...(data ?? {}) };
}

/**
 * A failed action result, as a SvelteKit `fail()` so the HTTP status is set too.
 *
 * Prefer this over `error()` inside an action: `error()` replaces the page with
 * the error template, discarding whatever the contributor had typed.
 */
export function actionFail<A extends string>(
	status: number,
	action: A,
	error: string
): ActionFailure<ActionErr<A>> {
	return fail(status, { action, success: false as const, error });
}

// ── Field parsing ───────────────────────────────────────────────────────────

/** A single trimmed text field; `''` when absent. */
export function field(data: FormData, name: string): string {
	return String(data.get(name) ?? '').trim();
}

/** A trimmed text field, or `null` when empty — for nullable columns. */
export function fieldOrNull(data: FormData, name: string): string | null {
	return field(data, name) || null;
}

/** Every value submitted under `name`, in document order. Used by repeaters. */
export function fieldList(data: FormData, name: string): string[] {
	return data.getAll(name).map(String);
}

/** An integer field, falling back to `fallback` when absent or unparseable. */
export function intField(data: FormData, name: string, fallback: number): number {
	const parsed = parseInt(field(data, name), 10);
	return Number.isNaN(parsed) ? fallback : parsed;
}

/** An uploaded file, or `null` when nothing was chosen. */
export function fileField(data: FormData, name: string): File | null {
	const value = data.get(name);
	if (!(value instanceof File) || value.size === 0) return null;
	return value;
}

// ── Year parsing ────────────────────────────────────────────────────────────

/** Earliest accepted competition year. */
export const MIN_YEAR = 1900;
/** Latest accepted competition year, loose enough to schedule ahead. */
export const MAX_YEAR = 2100;

export const YEAR_RANGE_ERROR = `Please enter a valid year (${MIN_YEAR}-${MAX_YEAR})`;

/** A competition year, or `null` if it isn't an integer in range. */
export function parseYear(raw: string | number): number | null {
	const year = typeof raw === 'number' ? raw : parseInt(raw.trim(), 10);
	if (Number.isNaN(year) || year < MIN_YEAR || year > MAX_YEAR) return null;
	return year;
}
