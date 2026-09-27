import { fail, type ActionFailure } from '@sveltejs/kit';
import { MAX_YEAR, MIN_YEAR } from '$lib/constants';

/*
 * Form-field parsing and the result shape every action returns:
 *
 *   { action: 'uploadFile', success: true, ...payload }
 *   { action: 'uploadFile', success: false, error: '...' }
 *
 * The literal `success` makes `form` a discriminated union, narrowed further by
 * `action`. `$lib/forms.svelte.ts` relies on this shape; change both together.
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
 * A failed action result, via SvelteKit's `fail()`. Use this, not `error()`, in
 * actions: `error()` replaces the page and discards what the user typed.
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

// Re-exported from `$lib/constants.ts` for server callers.
export { MIN_YEAR, MAX_YEAR };

export const YEAR_RANGE_ERROR = `Please enter a valid year (${MIN_YEAR}-${MAX_YEAR})`;

/** A competition year, or `null` if it isn't an integer in range. */
export function parseYear(raw: string | number): number | null {
	const year = typeof raw === 'number' ? raw : parseInt(raw.trim(), 10);
	if (Number.isNaN(year) || year < MIN_YEAR || year > MAX_YEAR) return null;
	return year;
}
