/**
 * Checks whether a string is a two-character flag emoji composed of
 * Unicode Regional Indicator Symbols (U+1F1E6–U+1F1FF).
 *
 * Returns the ISO 3166-1 alpha-2 country code in **lowercase** if it is
 * a flag emoji, or `null` for any other string (regular emoji, text, etc.).
 *
 * Examples:
 *   '🇸🇬'  → 'sg'
 *   '🇺🇸'  → 'us'
 *   '⚛️'   → null
 *   '🌍'   → null
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