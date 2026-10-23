import { SHARED_CACHE_CONTROL } from '../../../../src/lib/server/cache';
import {
	CREDITS,
	DELTA_W_BULK,
	FILE_URLS,
	PHRASES,
	SCRIPT_IN_TEXT,
	USERS,
	XSS_TITLE
} from '../../fixtures/seed-data';
import { expect, test } from '../../support/test';

/*
 * The public `/api/*` shapes. Cloudflare keeps each body for a day, so a changed
 * shape needs a purge before deploying (CLAUDE.md rule 9). A failure here means
 * either a bug or a shape change that needs that purge; see docs/deployment.md,
 * "Purging the cache after an API change".
 *
 * Reads frozen seed rows only (CREDITS for the contributor shapes).
 */

/** `/api/search/files?q=…[&olympiad=…]`, with the query encoded. */
function filesUrl(q: string, olympiad?: string): string {
	const params = new URLSearchParams({ q });
	if (olympiad !== undefined) params.set('olympiad', olympiad);
	return `/api/search/files?${params}`;
}

test.describe('the API contract', { tag: '@smoke' }, () => {
	test('/api/olympiads is OlympiadEntry[], in display order', async ({ request }) => {
		const body = await (await request.get('/api/olympiads')).json();
		expect(Array.isArray(body)).toBe(true);

		const alpha = body.find((o: { id: string }) => o.id === 'alpha');
		// Exactly these keys: `descriptionMd` and `displayOrder` must not reach the
		// shared cache (toOlympiadEntry).
		expect(alpha).toEqual({
			id: 'alpha',
			name: 'Alpha Physics Olympiad',
			summary: 'The main frozen olympiad.',
			icon: '🅰️',
			tag: 'International',
			descriptionHtml: '<p>Alpha is <strong>frozen</strong> seed data.</p>'
		});
		// No description: the key is omitted, not null.
		expect(Object.keys(body.find((o: { id: string }) => o.id === 'beta')).sort()).toEqual(
			['icon', 'id', 'name', 'summary', 'tag'].sort()
		);

		// By display order, then id: aardvark sorts first by id but has a later
		// display order than beta.
		const ids = body.map((o: { id: string }) => o.id);
		expect(ids.indexOf('alpha')).toBeLessThan(ids.indexOf('beta'));
		expect(ids.indexOf('beta')).toBeLessThan(ids.indexOf('aardvark'));
	});

	test('/api/olympiads/[olympiad] is YearEntry[], newest year first', async ({ request }) => {
		const body = await (await request.get('/api/olympiads/alpha')).json();
		expect(body.map((y: { year: number }) => y.year)).toEqual([2020, 2019]);

		const y2019 = body[1];
		expect(Object.keys(y2019).sort()).toEqual(
			['extraLinks', 'notes', 'problems', 'year', 'yearFiles'].sort()
		);
		expect(y2019.notes).toEqual(['Held online.']);
		expect(y2019.yearFiles).toEqual([{ label: 'Problems', url: FILE_URLS.alphaPaper }]);
		expect(y2019.problems[0]).toEqual({
			number: 'T1',
			title: 'Rolling Cylinder',
			// Topics travel for the browser-side filter, and are never rendered.
			topics: ['Mechanics'],
			maxScore: 10,
			files: [{ label: 'Solution', url: FILE_URLS.alphaSolution }]
		});
		expect(y2019.problems[2].maxScore).toBe(7.5);

		// No title and no max score: both keys omitted, not null; topics still an
		// array, since `undefined` means a body cached before topics existed.
		expect(body[0].problems[1]).toEqual({ number: '2', topics: [], files: [] });
	});

	test('/api/search is SearchItem[] whose searchText has no topic', async ({ request }) => {
		const body = await (await request.get('/api/search')).json();
		const t1 = body.find(
			(i: { olympiadId: string; year: number; problem: { number: string } }) =>
				i.olympiadId === 'alpha' && i.year === 2019 && i.problem.number === 'T1'
		);
		expect(t1).toEqual({
			olympiadId: 'alpha',
			olympiadName: 'Alpha Physics Olympiad',
			olympiadIcon: '🅰️',
			year: 2019,
			searchText: 'alpha alpha physics olympiad 2019 t1 rolling cylinder',
			problem: {
				number: 'T1',
				title: 'Rolling Cylinder',
				topics: ['Mechanics'],
				files: [{ label: 'Solution', url: FILE_URLS.alphaSolution }]
			}
		});
		// An untitled problem has no `title` key here either.
		const untitled = body.find(
			(i: { olympiadId: string; year: number; problem: { number: string } }) =>
				i.olympiadId === 'alpha' && i.year === 2020 && i.problem.number === '2'
		);
		expect(untitled.problem).toEqual({ number: '2', topics: [], files: [] });
		expect(untitled.searchText).toBe('alpha alpha physics olympiad 2020 2 ');

		// The ranking contract: a topic in the haystack would let a search reveal it
		// (docs/search.md, "Never put a topic name in searchText").
		for (const item of body) {
			for (const topic of item.problem.topics) {
				expect(item.searchText).not.toContain(topic.toLowerCase());
			}
		}
	});

	test('/api/stats is the three counters', async ({ request }) => {
		const body = await (await request.get('/api/stats')).json();
		// Values are not asserted: other specs add rows, and the body is cached.
		expect(Object.keys(body).sort()).toEqual(['files', 'olympiads', 'years']);
		for (const value of Object.values(body)) expect(Number.isInteger(value)).toBe(true);
	});

	test('/api/search/files is a FileSearchResponse, files not problems', async ({ request }) => {
		const body = await (await request.get(filesUrl(PHRASES.alphaPaper))).json();
		expect(Object.keys(body).sort()).toEqual(['indexEmpty', 'query', 'results', 'truncated']);
		expect(body.query).toBe(PHRASES.alphaPaper);
		expect(body.truncated).toBe(false);
		expect(body.indexEmpty).toBe(false);
		expect(body.results).toHaveLength(1);

		const [hit] = body.results;
		expect(Object.keys(hit).sort()).toEqual(
			[
				'file',
				'matches',
				'olympiadIcon',
				'olympiadId',
				'olympiadName',
				'problems',
				'snippet',
				'year'
			].sort()
		);
		expect(hit.file).toEqual({ label: 'Problems', url: FILE_URLS.alphaPaper });
		expect(hit.olympiadId).toBe('alpha');
		expect(hit.year).toBe(2019);
		// Year-level: an empty list, not a `level` field.
		expect(hit.problems).toEqual([]);
		// The snippet is plain text; the matches are offsets into it.
		const marked = hit.matches.map(([start, end]: [number, number]) =>
			hit.snippet.slice(start, end)
		);
		expect(marked.join(' ').toLowerCase()).toBe(PHRASES.alphaPaper);
	});

	test('a problem file lists its problem, and markup in the text stays text', async ({
		request
	}) => {
		const body = await (await request.get(filesUrl(PHRASES.alphaSolution))).json();
		expect(body.results).toHaveLength(1);
		const [hit] = body.results;
		expect(hit.file).toEqual({ label: 'Solution', url: FILE_URLS.alphaSolution });
		expect(hit.problems).toEqual([{ number: 'T1', title: 'Rolling Cylinder' }]);

		// Never HTML, and never the STX/ETX sentinels snippet() marks with.
		const markup = await (await request.get(filesUrl('which must stay text'))).json();
		expect(markup.results[0].snippet).toContain(SCRIPT_IN_TEXT);
		expect(markup.results[0].snippet).not.toContain(String.fromCharCode(2));
		expect(markup.results[0].snippet).not.toContain(String.fromCharCode(3));
	});

	test('the problem titles in /api/search are data, not markup', async ({ request }) => {
		const body = await (await request.get('/api/search')).json();
		const titles = body.map((i: { problem: { title?: string } }) => i.problem.title);
		expect(titles).toContain(XSS_TITLE);
	});

	test('/api/olympiads/[olympiad]/contributors is Contributor[], most uploads first', async ({
		request
	}) => {
		const body = await (
			await request.get(`/api/olympiads/${CREDITS.olympiad}/contributors`)
		).json();
		// Exactly these keys: no email and no user id reach the shared cache. The
		// banned uploader's file is credited but never listed.
		expect(body).toEqual([
			{ name: USERS.creditTop.name, image: null, uploads: 3 },
			{ name: USERS.creditAdmin.name, image: null, uploads: 1 }
		]);
	});

	test('/api/team is TeamMember[], admins and contributors only', async ({ request }) => {
		const body: { name: string; role: string; uploads: number }[] = await (
			await request.get('/api/team')
		).json();
		const top = body.find((m) => m.name === USERS.creditTop.name);
		expect(top).toEqual({
			name: USERS.creditTop.name,
			image: null,
			role: 'contributor',
			uploads: 3
		});
		for (const member of body) {
			expect(Object.keys(member).sort()).toEqual(['image', 'name', 'role', 'uploads']);
			expect(['admin', 'contributor']).toContain(member.role);
		}
	});
});

test.describe('deep search input validation', { tag: '@smoke' }, () => {
	/** A 400 is refused before D1 and before the cache header, so it is never cached. */
	async function expectRefused(
		request: import('@playwright/test').APIRequestContext,
		url: string,
		message: string
	) {
		const response = await request.get(url);
		expect(response.status(), url).toBe(400);
		expect(response.headers()['cache-control'] ?? '', url).not.toContain('s-maxage');
		expect(await response.text(), url).toContain(message);
	}

	test('too short, missing and too long queries are 400s', async ({ request }) => {
		await expectRefused(request, '/api/search/files', 'Type at least 5 characters');
		await expectRefused(request, filesUrl('abcd'), 'Type at least 5 characters');
		// Whitespace is collapsed before the length check: this is "ab c".
		await expectRefused(request, filesUrl('  ab     c  '), 'Type at least 5 characters');
		await expectRefused(request, filesUrl('a'.repeat(201)), 'Search query too long');

		const atLimit = await request.get(filesUrl('a'.repeat(200)));
		expect(atLimit.status()).toBe(200);
		const atMinimum = await request.get(filesUrl('abcde'));
		expect(atMinimum.status()).toBe(200);
	});

	test('an empty olympiad filter is the unfiltered search', async ({ request }) => {
		const unfiltered = await (await request.get(filesUrl(PHRASES.alphaSolution))).json();
		const empty = await request.get(filesUrl(PHRASES.alphaSolution, ''));
		expect(empty.status()).toBe(200);
		expect(empty.headers()['cache-control']).toBe(SHARED_CACHE_CONTROL);
		expect(await empty.json()).toEqual(unfiltered);
	});

	test('an unknown but well-formed olympiad is a cached empty answer', async ({ request }) => {
		const response = await request.get(filesUrl(PHRASES.alphaSolution, 'iphoo'));
		expect(response.status()).toBe(200);
		expect(response.headers()['cache-control']).toBe(SHARED_CACHE_CONTROL);
		expect((await response.json()).results).toEqual([]);
	});

	test('a malformed olympiad filter is a 400', async ({ request }) => {
		for (const olympiad of ['a b', 'a/b', '-delta', 'x'.repeat(33), 'del.ta']) {
			await expectRefused(
				request,
				filesUrl(PHRASES.alphaSolution, olympiad),
				'Invalid olympiad filter'
			);
		}
	});

	test('the filter is case-insensitive and in scope only', async ({ request }) => {
		// `delta` must not match `delta-w`: the range's lower bound ends in `/`
		// (olympiadUrlRange in storage.ts). `results` alone can't show a leak,
		// because searchFiles drops a hit whose owner is another olympiad after the
		// LIMIT. `truncated` can: delta-w has DEEP_SEARCH_LIMIT + 1 files with this
		// phrase, so a leaking scope fills pass 1 with them.
		const leak = await (await request.get(filesUrl(PHRASES.deltaWBulk, 'delta'))).json();
		expect(leak).toEqual({
			query: PHRASES.deltaWBulk,
			results: [],
			truncated: false,
			indexEmpty: false
		});
		const bulk = await (await request.get(filesUrl(PHRASES.deltaWBulk, 'delta-w'))).json();
		// DEEP_SEARCH_LIMIT, which is DELTA_W_BULK - 1 (#lib/search can't be imported here).
		expect(bulk.results).toHaveLength(DELTA_W_BULK - 1);
		expect(bulk.truncated).toBe(true);

		const delta = await (await request.get(filesUrl(PHRASES.deltaW, 'delta'))).json();
		expect(delta.results).toEqual([]);

		const deltaW = await (await request.get(filesUrl(PHRASES.deltaW, 'delta-w'))).json();
		expect(deltaW.results.map((r: { file: { url: string } }) => r.file.url)).toEqual([
			FILE_URLS.deltaWPaper
		]);

		const upper = await (await request.get(filesUrl(PHRASES.deltaW, 'DELTA-W'))).json();
		expect(upper).toEqual(deltaW);
	});

	test('FTS5 syntax in a query never causes a 500', async ({ request }) => {
		// Every token becomes a quoted FTS5 string (sanitizeFtsQuery), so operators
		// are inert.
		for (const q of ['?????', '"black hole"', '"black hol', 'foo OR bar', '-NEAR(a b)', 'e=mc^2']) {
			const response = await request.get(filesUrl(q));
			expect(response.status(), q).toBe(200);
			const body = await response.json();
			expect(Array.isArray(body.results), q).toBe(true);
		}
	});
});
