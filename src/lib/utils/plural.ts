/**
 * `n` and the matching noun form: `plural(1, 'olympiad')` is "1 olympiad",
 * `plural(4, 'olympiad')` is "4 olympiads". The number is printed raw, with no
 * thousands separators, like all counts in the app.
 *
 * @param many the plural when it isn't `one + 's'` ("entries"). Works for verbs
 *   too: `plural(n, 'problem matches', 'problems match')`.
 */
export function plural(n: number, one: string, many = `${one}s`): string {
	return `${n} ${n === 1 ? one : many}`;
}

/** The noun alone, agreeing with `n`. For when the count is rendered separately. */
export function pluralize(n: number, one: string, many = `${one}s`): string {
	return n === 1 ? one : many;
}
