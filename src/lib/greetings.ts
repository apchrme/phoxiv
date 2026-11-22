/**
 * The dashboard's greeting and description. Both are picked at random on every
 * request, in the page load: `/` is `no-store`, so a refresh gets a new pick,
 * and the text is right on first paint. The greeting also depends on the
 * visitor's local hour, from the timezone Cloudflare derives from their IP.
 */

type Period = 'morning' | 'afternoon' | 'evening' | 'night';

/** Every greeting is followed by `, {name}`. */
export const GREETINGS: Record<Period | 'any', string[]> = {
	morning: ['Good morning', 'Rise and shine', 'Morning'],
	afternoon: ['Good afternoon', 'Afternoon'],
	evening: ['Good evening', 'Evening'],
	night: ['Sleep well', "It's pretty late", 'Good night', 'Time to sleep'],
	// Mixed into every period.
	any: ['Welcome back', 'Hello', 'Hi there']
};

export const DESCRIPTIONS = [
	'Every day is a new beginning.',
	'Pick up where you left off.',
	"How's it going?"
];

export function periodOf(hour: number): Period {
	if (hour >= 5 && hour < 12) return 'morning';
	if (hour >= 12 && hour < 17) return 'afternoon';
	if (hour >= 17 && hour < 22) return 'evening';
	return 'night';
}

/** The hour (0–23) in an IANA zone, or in UTC if the zone is missing or unknown. */
export function hourIn(timeZone: string | undefined, now: Date = new Date()): number {
	if (timeZone) {
		try {
			const hour = new Intl.DateTimeFormat('en-GB', {
				hour: 'numeric',
				hourCycle: 'h23',
				timeZone
			}).format(now);
			return Number(hour);
		} catch {
			// An unknown zone throws a RangeError; fall through to UTC.
		}
	}
	return now.getUTCHours();
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
