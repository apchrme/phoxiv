/**
 * The dashboard's greeting and description. Both are picked at random, and the
 * greeting also depends on the visitor's local hour, so they are chosen in the
 * browser: the server only knows UTC.
 */

type Period = 'morning' | 'afternoon' | 'evening' | 'night';

/** Every greeting is followed by `, {name}`. */
const GREETINGS: Record<Period | 'any', string[]> = {
	morning: ['Good morning', 'Rise and shine', 'Morning'],
	afternoon: ['Good afternoon', 'Afternoon'],
	evening: ['Good evening', 'Evening'],
	night: ['Sleep well', 'It\'s pretty late', 'Good night', 'Time to sleep'],
	// Mixed into every period.
	any: ['Welcome back', 'Hello', 'Hi there']
};

export const DESCRIPTIONS = [
	'Every day is a new beginning.',
	'Pick up where you left off.',
	'How\'s it going?'
];

/** The greeting used before the browser has chosen one (and when scripts are off). */
export const DEFAULT_GREETING = 'Welcome back';
export const DEFAULT_DESCRIPTION = DESCRIPTIONS[0];

export function periodOf(hour: number): Period {
	if (hour >= 5 && hour < 12) return 'morning';
	if (hour >= 12 && hour < 17) return 'afternoon';
	if (hour >= 17 && hour < 22) return 'evening';
	return 'night';
}

function choose<T>(items: readonly T[], random: () => number): T {
	return items[Math.floor(random() * items.length)];
}

export function pickGreeting(hour: number, random: () => number = Math.random): string {
	return choose([...GREETINGS[periodOf(hour)], ...GREETINGS.any], random);
}

export function pickDescription(random: () => number = Math.random): string {
	return choose(DESCRIPTIONS, random);
}
