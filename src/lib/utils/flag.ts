/**
 * The lowercase ISO country code of a flag emoji (two Regional Indicator
 * Symbols), or `null` for anything else. `'🇸🇬'` → `'sg'`, `'🌍'` → `null`.
 */
export function getFlagCountryCode(emoji: string): string | null {
	const chars = [...emoji]; // split by Unicode code points, not UTF-16 code units
	if (chars.length !== 2) return null;

	const REGIONAL_A = 0x1f1e6; // 🇦
	const REGIONAL_Z = 0x1f1ff; // 🇿

	const a = chars[0].codePointAt(0) ?? 0;
	const b = chars[1].codePointAt(0) ?? 0;

	if (a < REGIONAL_A || a > REGIONAL_Z || b < REGIONAL_A || b > REGIONAL_Z) return null;

	const letter1 = String.fromCharCode(a - REGIONAL_A + 65); // 65 = 'A'
	const letter2 = String.fromCharCode(b - REGIONAL_A + 65);

	return (letter1 + letter2).toLowerCase();
}
