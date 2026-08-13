/**
 * Date formatting for the whole app.
 *
 * The formatters are built once at module scope rather than per call:
 * `toLocaleDateString` constructs a fresh `Intl.DateTimeFormat` on every
 * invocation, and the admin activity log renders up to 100 timestamps per pass.
 */

type DateInput = Date | string | number | null | undefined;

/** Rendered in place of a missing date, so a nullish value never becomes "today". */
const EMPTY = '—';

const LONG = new Intl.DateTimeFormat('en-GB', {
	day: 'numeric',
	month: 'long',
	year: 'numeric'
});

const SHORT = new Intl.DateTimeFormat('en-GB', {
	day: 'numeric',
	month: 'short',
	year: 'numeric'
});

const DATE_TIME = new Intl.DateTimeFormat('en-GB', {
	day: 'numeric',
	month: 'short',
	year: 'numeric',
	hour: '2-digit',
	minute: '2-digit'
});

function toDate(value: DateInput): Date | null {
	if (value === null || value === undefined || value === '') return null;
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * A date with no time, e.g. `13 August 2026` (`'long'`) or `13 Aug 2026`
 * (`'short'`). Returns `'—'` for a missing or unparseable value.
 */
export function formatDate(value: DateInput, style: 'long' | 'short' = 'long'): string {
	const date = toDate(value);
	if (!date) return EMPTY;
	return (style === 'short' ? SHORT : LONG).format(date);
}

/** A date and time, e.g. `13 Aug 2026, 19:45`. Returns `'—'` when missing. */
export function formatDateTime(value: DateInput): string {
	const date = toDate(value);
	if (!date) return EMPTY;
	return DATE_TIME.format(date);
}
