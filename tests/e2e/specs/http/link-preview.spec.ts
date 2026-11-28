import { expect, test } from '../../support/test';

/*
 * The link-preview tags in src/routes/+layout.svelte. Unfurlers (Discord, Slack,
 * X) read the server-rendered HTML and run no JavaScript, so these are checked
 * on the raw response, not in a browser. Read-only.
 */

/** The `content` of the first `<meta>` whose `property` or `name` is `key`. */
function metaContent(html: string, key: string): string | undefined {
	const tag = html.match(new RegExp(`<meta[^>]*(?:property|name)="${key}"[^>]*>`))?.[0];
	return tag?.match(/content="([^"]*)"/)?.[1];
}

test.describe('link previews', { tag: '@smoke' }, () => {
	for (const path of ['/', '/olympiads', '/olympiads/alpha', '/about']) {
		test(`${path} carries a large preview image`, async ({ request }) => {
			const html = await (await request.get(path)).text();

			expect(metaContent(html, 'twitter:card')).toBe('summary_large_image');
			expect(metaContent(html, 'og:site_name')).toBe('phoXiv');

			const image = metaContent(html, 'og:image');
			// Unfurlers ignore a relative image URL.
			expect(image).toMatch(/^https?:\/\//);
			expect(metaContent(html, 'twitter:image')).toBe(image);

			const url = new URL(metaContent(html, 'og:url')!);
			expect(url.pathname).toBe(path);
		});
	}

	test('the preview image is served as a PNG', async ({ request }) => {
		const html = await (await request.get('/')).text();
		const image = new URL(metaContent(html, 'og:image')!);

		const response = await request.get(image.pathname);
		expect(response.status()).toBe(200);
		expect(response.headers()['content-type']).toBe('image/png');
	});
});
