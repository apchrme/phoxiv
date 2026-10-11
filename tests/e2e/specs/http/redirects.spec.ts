import { CDN_BASE_URL } from '../../../../src/lib/constants';
import { expect, test } from '../../support/test';

/*
 * The legacy redirects in src/routes/+layout.ts. Old links to `/ipho/…`,
 * `/contests/…` and documents once served from `/static` must keep working.
 */

const CASES: { from: string; to: string }[] = [
	// Olympiads once served at the site root.
	{ from: '/ipho', to: '/olympiads/ipho' },
	{ from: '/ipho/2019', to: '/olympiads/ipho/2019' },
	{ from: '/apho/2017/T1', to: '/olympiads/apho/2017/T1' },
	{ from: '/usapho/1997', to: '/olympiads/usapho/1997' },
	// The old section name.
	{ from: '/contests', to: '/olympiads' },
	{ from: '/contests/alpha', to: '/olympiads/alpha' },
	// Documents now on the CDN, every extension in the list. `extensionOf` rather
	// than a fixed-width suffix, which "silently skipped `.xlsx`, `.html` and
	// `.docx`" (+layout.ts).
	...['pdf', 'xlsx', 'zip', 'htm', 'html', 'doc', 'docx'].map((ext) => ({
		from: `/olympiads/alpha/2019/problems.${ext}`,
		to: `${CDN_BASE_URL}/olympiads/alpha/2019/problems.${ext}`
	}))
];

test.describe('legacy redirects', { tag: '@smoke' }, () => {
	for (const { from, to } of CASES) {
		test(`${from} → ${to}`, async ({ request }) => {
			const response = await request.get(from, { maxRedirects: 0 });
			expect(response.status()).toBe(308);
			expect(response.headers().location).toBe(to);
		});
	}

	test('current URLs are not redirected', async ({ request }) => {
		for (const path of ['/olympiads', '/olympiads/alpha', '/olympiads/alpha/2019']) {
			const response = await request.get(path, { maxRedirects: 0 });
			expect(response.status(), path).not.toBe(308);
		}
	});
});
