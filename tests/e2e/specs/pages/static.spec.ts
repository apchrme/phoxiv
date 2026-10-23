import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { CDN_BASE_URL } from '../../../../src/lib/constants';
import type { OlympiadEntry } from '../../../../src/lib/types';
import { CORPUS, type CorpusEntry } from '../../../../src/routes/corpus';
import { REPO_ROOT } from '../../support/env';
import { expect, test } from '../../support/test';
import { gotoReady } from '../../support/ui';

/*
 * The pages with no data of their own: the landing page (src/routes/+page.svelte
 * and its bands), the blog, /resources and /privacy, and the theme control every
 * page carries in its nav.
 *
 * Read-only: no seed rows of its own, and nothing written. The landing page's
 * counts come from /api/stats, which is shared-cached for the run, so they are
 * checked against the response the page itself received, never against a total.
 * Counts and icons the seed can't produce (four digits and more, the corpus
 * olympiads' icons) are served to one page with `page.route`.
 */

/** The landing page's sections, each found by its own heading. */
function landingSection(page: Page, heading: string): Locator {
	return page.locator('section').filter({ has: page.getByRole('heading', { name: heading }) });
}

/** The `<dl>` of StatsBand.svelte. */
function statsList(page: Page): Locator {
	return landingSection(page, 'Yes, I meant any problem.').locator('dl');
}

/**
 * The band's aria snapshot for these values: a term per label and its count as
 * the definition. The reels are `aria-hidden`, so a definition reads only the
 * `sr-only` copy of the number, which is what a screen reader announces.
 */
function statsSnapshot(values: { olympiads: string; years: string; files: string }): string {
	return [
		'- term: Olympiads',
		`- definition: "${values.olympiads}"`,
		'- term: Years',
		`- definition: "${values.years}"`,
		'- term: Files',
		`- definition: "${values.files}"`
	].join('\n');
}

/**
 * The digits the reels land on, left to right. Each strip carries its digit in
 * `data-digit` for the GSAP timeline, so the attribute is what the reel shows.
 */
async function expectReels(list: Locator, label: string, value: number): Promise<void> {
	const strips = list
		.locator('div')
		.filter({ has: list.page().getByRole('term').filter({ hasText: label }) })
		.locator('[data-digit]');
	const digits = String(value).split('');
	await expect(strips).toHaveCount(digits.length);
	for (const [i, digit] of digits.entries()) {
		await expect(strips.nth(i)).toHaveAttribute('data-digit', digit);
	}
}

/**
 * Lets the page finish handling a response it has already received: its fetch
 * resolves, Svelte flushes the update in a microtask, and two animation frames
 * later the result is painted. Not a timed wait: it ends when the page's own
 * work does.
 */
async function settle(page: Page): Promise<void> {
	await page.evaluate(
		() =>
			new Promise<void>((resolve) =>
				requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
			)
	);
}

/**
 * Every image URL in the page: each `<img>`'s `src` and each `<source>`'s
 * `srcset` candidates (enhanced:img renders a `<picture>`). Read once the page
 * has settled, so not retried.
 */
function imageUrls(page: Page): Promise<string[]> {
	return page.locator('img, source').evaluateAll((elements) =>
		elements.flatMap((el) => {
			if (el instanceof HTMLImageElement) return [el.getAttribute('src') ?? ''];
			return (el.getAttribute('srcset') ?? '')
				.split(',')
				.map((candidate) => candidate.trim().split(/\s+/)[0])
				.filter(Boolean);
		})
	);
}

/** The URLs that are neither inline (`data:`) nor on the page's own origin. */
function externalImages(page: Page, urls: string[]): string[] {
	const origin = new URL(page.url()).origin;
	return urls.filter((url) => !url.startsWith('data:') && new URL(url, origin).origin !== origin);
}

test.describe('the landing page', () => {
	test.describe('stats band', () => {
		test('shows the counts /api/stats returned, as digits', async ({ page }) => {
			const stats = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/stats');
			await gotoReady(page, '/');
			const response = await stats;
			expect(response.status()).toBe(200);
			const body: { olympiads: number; years: number; files: number } = await response.json();

			const list = statsList(page);
			await expect(list).toMatchAriaSnapshot(
				statsSnapshot({
					olympiads: String(body.olympiads),
					years: String(body.years),
					files: String(body.files)
				})
			);
			await expectReels(list, 'Olympiads', body.olympiads);
			await expectReels(list, 'Years', body.years);
			await expectReels(list, 'Files', body.files);
		});

		test('prints counts raw, with no thousands separators', async ({ page }) => {
			// Four digits and more, which `toLocaleString()` in this en-GB browser would
			// print as "1,234".
			const counts = { olympiads: 1234, years: 56789, files: 1234567 };
			await page.route('**/api/stats', (route) => route.fulfill({ json: counts }));
			await gotoReady(page, '/');

			const list = statsList(page);
			await expect(list).toMatchAriaSnapshot(
				statsSnapshot({ olympiads: '1234', years: '56789', files: '1234567' })
			);
			await expectReels(list, 'Olympiads', counts.olympiads);
			await expectReels(list, 'Years', counts.years);
			await expectReels(list, 'Files', counts.files);
			await expect(list).not.toContainText(',');
		});

		test('shows "—" for every count when /api/stats fails', async ({ page }) => {
			// "Don't seed it with zeroes, or a failed fetch shows an empty archive"
			// (StatsBand.svelte).
			await page.route('**/api/stats', (route) => route.fulfill({ status: 500, body: 'boom' }));
			const failed = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/stats');
			await gotoReady(page, '/');
			expect((await failed).status()).toBe(500);
			// The dash is also what shows while loading, so let the page handle the
			// 500 before checking it is still there.
			await settle(page);

			const list = statsList(page);
			await expect(list).toMatchAriaSnapshot(
				statsSnapshot({ olympiads: '—', years: '—', files: '—' })
			);
			await expect(list.locator('[data-digit]')).toHaveCount(0);
			await expect(list).not.toContainText('0');
		});
	});

	test.describe('calls to action', () => {
		test('signed out, they lead to the olympiads and to sign-in', async ({ page }) => {
			await gotoReady(page, '/');
			const hero = landingSection(page, 'Every olympiad, one place.');
			await expect(
				hero.getByRole('link', { name: 'Browse olympiads', exact: true })
			).toHaveAttribute('href', '/olympiads');
			await expect(hero.getByRole('link', { name: 'Login', exact: true })).toHaveAttribute(
				'href',
				'/login'
			);
			await expect(hero.getByRole('link', { name: 'Contribute', exact: true })).toHaveCount(0);

			// FeatureBlocks.svelte "Points blocks 03 and 04 past `/login` for signed-in
			// visitors"; signed out, both go to it.
			await expect(page.getByRole('link', { name: 'Sign in to track' })).toHaveAttribute(
				'href',
				'/login'
			);
			await expect(page.getByRole('link', { name: 'Sign in to contribute' })).toHaveAttribute(
				'href',
				'/login'
			);
			await expect(page.getByRole('link', { name: 'See your progress' })).toHaveCount(0);

			// The hero's, block 01's and the closing section's.
			const browse = page.getByRole('link', { name: 'Browse olympiads' });
			await expect(browse).toHaveCount(3);
			for (const link of await browse.all())
				await expect(link).toHaveAttribute('href', '/olympiads');
		});

		test.describe('signed in', () => {
			test.use({ role: 'user' });

			test('they lead to the editor and the profile instead', async ({ page }) => {
				await gotoReady(page, '/');
				const hero = landingSection(page, 'Every olympiad, one place.');
				await expect(hero.getByRole('link', { name: 'Contribute', exact: true })).toHaveAttribute(
					'href',
					'/contribute'
				);
				await expect(hero.getByRole('link', { name: 'Login', exact: true })).toHaveCount(0);

				await expect(page.getByRole('link', { name: 'See your progress' })).toHaveAttribute(
					'href',
					'/profile'
				);
				await expect(page.getByRole('link', { name: 'Open the editor' })).toHaveAttribute(
					'href',
					'/contribute'
				);
				await expect(page.getByRole('link', { name: /^Sign in to/ })).toHaveCount(0);
			});
		});

		test('"Browse olympiads" opens the olympiads index', async ({ page }) => {
			await gotoReady(page, '/');
			await landingSection(page, 'Every olympiad, one place.')
				.getByRole('link', { name: 'Browse olympiads', exact: true })
				.click();
			await expect(page).toHaveURL('/olympiads');
			await expect(page.getByRole('heading', { level: 1, name: 'Olympiads' })).toBeVisible();
		});
	});

	test.describe('corpus band', () => {
		/** A tile's accessible name: its label, year, problem number and file, as CorpusTile.svelte prints them. */
		function tileName(entry: CorpusEntry): string {
			return [entry.label, entry.year, entry.num, entry.file]
				.filter((p) => p !== undefined)
				.join(' ');
		}

		test('has a tile for each corpus.ts entry, linking to its olympiad and year', async ({
			page,
			blockedRequests
		}) => {
			expect(CORPUS).toHaveLength(18);
			const icons = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/olympiads');
			await gotoReady(page, '/');
			await icons;

			// Motion is reduced, so the band shows one still set and no marquee clones;
			// with motion, the clones are `aria-hidden` and out of the role query too.
			const tiles = landingSection(page, 'Pick any problem. Really, any.').getByRole('link');
			await expect(tiles).toHaveCount(CORPUS.length);
			for (const [i, entry] of CORPUS.entries()) {
				const tile = tiles.nth(i);
				await expect(tile).toHaveAccessibleName(tileName(entry));
				// "The olympiad page scrolls to `#<year>`" (CorpusTile.svelte).
				await expect(tile).toHaveAttribute('href', `/olympiads/${entry.olympiad}#${entry.year}`);
				// And that olympiad and year are the file's own, by the R2 key layout:
				// `olympiads/<id>/<year>` then `/`, or `_` or `.` in the older flat keys.
				const key = `${CDN_BASE_URL}/olympiads/${entry.olympiad}/${entry.year}`;
				expect(entry.url.startsWith(key), entry.url).toBe(true);
				expect(['/', '_', '.'], entry.url).toContain(entry.url[key.length]);
			}

			// Thumbnails are bundled with the app, never fetched from the CDN. They are
			// lazy, and a tile clipped off-screen never loads its own, so fetch one.
			const thumb = (await tiles.first().locator('img').getAttribute('src')) ?? '';
			expect(thumb).toMatch(/^\/_app\/immutable\/assets\/ipho-1967\./);
			const served = await page.request.get(thumb);
			expect(served.status()).toBe(200);
			expect(served.headers()['content-type']).toMatch(/^image\//);

			// None of the corpus olympiads is seeded, so no tile has an icon to load,
			// and the page loads nothing from outside.
			expect(externalImages(page, await imageUrls(page))).toEqual([]);
			expect(blockedRequests).toEqual([]);
		});

		test('icons the CDN never delivers leave the page working', async ({
			page,
			blockedRequests
		}) => {
			// The corpus olympiads aren't seeded, so their icons are served here, one
			// of each kind OlympiadIcon.svelte renders: a local override, an uploaded
			// icon on the CDN, and a flag emoji, which it draws from flagcdn.com.
			const uploaded = `${CDN_BASE_URL}/olympiads/apho/icon.png`;
			const flag = 'https://flagcdn.com/sg.svg';
			const entries: OlympiadEntry[] = [
				{ id: 'ipho', name: 'IPhO', summary: '', icon: '🌍', tag: 'International' },
				{ id: 'apho', name: 'APhO', summary: '', icon: uploaded, tag: 'Regional' },
				{ id: 'sjpo', name: 'SJPO', summary: '', icon: '🇸🇬', tag: 'National' }
			];
			await page.route('**/api/olympiads', (route) => route.fulfill({ json: entries }));
			await gotoReady(page, '/');
			const band = landingSection(page, 'Pick any problem. Really, any.');

			// The override is a bundled file, named by the emoji it stands in for.
			await expect(
				band.getByRole('link', { name: 'IPhO 1967 Problems' }).getByRole('img', { name: '🌍' })
			).toHaveAttribute('src', /\/_app\/immutable\/assets\/ipho\./);

			// Both CDN loads were tried and refused by the test's network guard.
			await expect.poll(() => blockedRequests).toContain(uploaded);
			await expect.poll(() => blockedRequests).toContain(flag);

			// The flag falls back to the emoji ("Set when the flag CDN fails",
			// OlympiadIcon.svelte); the uploaded icon has no fallback and stays a
			// broken image, but its tile keeps its name and link.
			const sjpo = band.getByRole('link', { name: 'SJPO 2015 Problems' });
			await expect(sjpo.getByRole('img')).toHaveCount(0);
			await expect(sjpo).toContainText('🇸🇬');
			const apho = band.getByRole('link', { name: 'APhO 2017 Experiment' });
			await expect(apho.getByRole('img', { name: 'apho' })).toHaveAttribute('src', uploaded);
			await expect(apho).toHaveAttribute('href', '/olympiads/apho#2017');
			await expect(band.getByRole('link')).toHaveCount(CORPUS.length);

			// Every other image is local, and nothing else was refused. The flag's
			// `<img>` is gone, replaced by the emoji, so only its request remains.
			expect(externalImages(page, await imageUrls(page))).toEqual([uploaded]);
			expect(new Set(blockedRequests)).toEqual(new Set([uploaded, flag]));
		});
	});
});

test.describe('the blog', () => {
	type Post = { slug: string; title: string; date: string };

	/**
	 * The posts in src/lib/posts/, read from their frontmatter the way
	 * `loadPostList` (#lib/posts.ts) keeps them: drafts (no `date`) dropped, newest
	 * first.
	 */
	function readPosts(): Post[] {
		const dir = join(REPO_ROOT, 'src', 'lib', 'posts');
		return readdirSync(dir)
			.filter((name) => name.endsWith('.svx'))
			.map((name) => {
				const text = readFileSync(join(dir, name), 'utf8');
				const front = /^\s*---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? '';
				const field = (key: string) =>
					new RegExp(`^${key}:\\s*(.*)$`, 'm')
						.exec(front)?.[1]
						.trim()
						.replace(/^(['"])(.*)\1$/, '$2') ?? '';
				return { slug: name.replace(/\.svx$/, ''), title: field('title'), date: field('date') };
			})
			.filter((post) => post.date)
			.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
	}

	const posts = readPosts();

	test('lists every post, newest first', async ({ page }) => {
		expect(posts.length).toBeGreaterThan(0);
		await gotoReady(page, '/blog');
		await expect(page.getByRole('heading', { level: 1, name: 'Blog' })).toBeVisible();

		const items = page.getByRole('main').getByRole('listitem');
		await expect(items).toHaveCount(posts.length);
		for (const [i, post] of posts.entries()) {
			await expect(items.nth(i).getByRole('heading', { level: 2 })).toHaveText(post.title);
			await expect(items.nth(i).getByRole('link')).toHaveAttribute('href', `/blog/${post.slug}`);
		}
	});

	for (const post of posts) {
		test(`"${post.title}" opens with its title as the heading`, async ({ page }) => {
			const response = await page.goto(`/blog/${post.slug}`);
			expect(response?.status()).toBe(200);
			await expect(page.locator('html')).toHaveAttribute('data-hydrated', '');
			await expect(page.getByRole('heading', { level: 1 })).toHaveText(post.title);
			await expect(page.getByRole('link', { name: 'Back to blog' })).toHaveAttribute(
				'href',
				'/blog'
			);
		});
	}

	test('an unknown post is a 404 page', async ({ page }) => {
		const response = await page.goto('/blog/no-such-post');
		expect(response?.status()).toBe(404);
		// From the post's load in src/routes/(reg)/blog/[slug]/+page.ts.
		await expect(
			page.getByRole('heading', { level: 1, name: 'Error 404: Post "no-such-post" not found' })
		).toBeVisible();
	});
});

for (const { path, title } of [
	{ path: '/resources', title: 'Resources' },
	{ path: '/privacy', title: 'Privacy Policy' }
]) {
	// The page errors themselves are checked by the `test` fixture.
	test(`${path} renders its heading`, async ({ page }) => {
		const response = await page.goto(path);
		expect(response?.status()).toBe(200);
		await expect(page.locator('html')).toHaveAttribute('data-hydrated', '');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
	});
}

test.describe('the theme control', () => {
	/**
	 * mode-watcher's default dark class, which app.css's `dark` variant keys on,
	 * as a whole word in `<html>`'s class list.
	 */
	const DARK = /(^|\s)dark(\s|$)/;

	/** `<html>`'s background, which app.css sets apart for `html.dark`. */
	function background(page: Page): Promise<string> {
		return page.locator('html').evaluate((html) => getComputedStyle(html).backgroundColor);
	}

	async function chooseTheme(page: Page, name: 'Light' | 'Dark' | 'System'): Promise<void> {
		await page.getByRole('button', { name: 'Toggle theme' }).click();
		await page.getByRole('menuitem', { name }).click();
	}

	test('dark mode marks <html>, survives a reload, and switches back', async ({ page }) => {
		const html = page.locator('html');
		await gotoReady(page, '/privacy');
		// The browser prefers light, and nothing has been chosen yet.
		await expect(html).not.toHaveClass(DARK);
		await expect(html).toHaveCSS('color-scheme', 'light');
		const light = await background(page);

		await chooseTheme(page, 'Dark');
		// The class, and a matching `color-scheme` for the browser's own controls.
		await expect(html).toHaveClass(DARK);
		await expect(html).toHaveCSS('color-scheme', 'dark');
		await expect(html).not.toHaveCSS('background-color', light);
		const dark = await background(page);

		await page.reload();
		await expect(html).toHaveAttribute('data-hydrated', '');
		await expect(html).toHaveClass(DARK);
		await expect(html).toHaveCSS('background-color', dark);

		await chooseTheme(page, 'Light');
		await expect(html).not.toHaveClass(DARK);
		await expect(html).toHaveCSS('color-scheme', 'light');
		await expect(html).toHaveCSS('background-color', light);

		await page.reload();
		await expect(html).toHaveAttribute('data-hydrated', '');
		await expect(html).not.toHaveClass(DARK);
		await expect(html).toHaveCSS('background-color', light);
	});

	test('"System" follows the device', async ({ page }) => {
		const html = page.locator('html');
		await gotoReady(page, '/privacy');
		await chooseTheme(page, 'Dark');
		await expect(html).toHaveClass(DARK);

		await chooseTheme(page, 'System');
		await expect(html).not.toHaveClass(DARK);
		await page.emulateMedia({ colorScheme: 'dark' });
		await expect(html).toHaveClass(DARK);
		await page.emulateMedia({ colorScheme: 'light' });
		await expect(html).not.toHaveClass(DARK);
	});
});
