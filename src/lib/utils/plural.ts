/**
 * `n` followed by the right form of a noun: `plural(1, 'olympiad')` is
 * "1 olympiad", `plural(4, 'olympiad')` is "4 olympiads".
 *
 * Five places had written this out as a ternary, and three of them had put the
 * count on one side of the expression and the noun on the other, which is how
 * "1 olympiads" gets shipped.
 *
 * **The number is formatted raw** — no thousands separators, no
 * `Intl.NumberFormat`. That is the convention across this codebase's counts, and
 * it is not a detail this helper gets to change on their behalf.
 *
 * @param many the plural form, when adding an `s` does not produce it
 *   ("matches", "entries"). Verbs work too: `plural(n, 'problem matches',
 *   'problems match')`.
 */
export function plural(n: number, one: string, many = `${one}s`): string {
	return `${n} ${n === 1 ? one : many}`;
}

/** The noun alone, agreeing with `n`. For when the count is rendered separately. */
export function pluralize(n: number, one: string, many = `${one}s`): string {
	return n === 1 ? one : many;
}
