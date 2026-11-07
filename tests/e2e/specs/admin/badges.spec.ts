import type { APIRequestContext } from '@playwright/test';
import { BADGE_OLYMPIAD, BADGES } from '../../fixtures/seed-data';
import { postAction, type ActionFields } from '../../support/actions';
import { expect, test } from '../../support/test';
import { confirmDialog, gotoReady, pickOlympiad, toast } from '../../support/ui';

/*
 * The admin badge editor (src/routes/admin/badges/[id]/).
 *
 * Saving runs `recomputeBadge`, the SQL twin of `qualifies` in #lib/badges.
 * Each test pins the two together: the holder count after a save (SQL) must
 * agree with USERS.badgeReader's own standing from /progress/badges (JS). The
 * reader's progress is documented on BADGES in seed-data.ts.
 *
 * Every badge here is per-test and deleted at the end, and restricted to the
 * badge olympiad, whose only progress is the reader's: an unrestricted badge
 * would be awarded to other specs' users, and their tracking would toast. Each
 * leaves the reader at most 5 of 8, or earned, so dashboard.spec.ts's "Next
 * up" leader (3 of 4) stays first.
 */

const NEW = '/admin/badges/new';

/** The reader's standing on one badge, re-evaluated in JS. */
async function readerStanding(
	apiAs: (who: 'badgeReader') => Promise<APIRequestContext>,
	id: number
) {
	const response = await (await apiAs('badgeReader')).get('/progress/badges');
	expect(response.status()).toBe(200);
	return (await response.json())[id] as {
		count: number | null;
		earnedAt: string | null;
		revealed: { summary: string; requiredCount: number } | null;
	};
}

/** The fields of a valid badge, restricted to the badge olympiad. */
function fields(name: string, overrides: ActionFields = {}): ActionFields {
	return {
		name,
		description: '',
		icon: 'star',
		color: 'teal',
		requiredCount: '1',
		scoreMinPct: '',
		scoreMaxPct: '',
		scope: 'filter',
		topics: '[]',
		olympiadId: BADGE_OLYMPIAD.id,
		problems: '[]',
		...overrides
	};
}

test.describe('the badge editor', () => {
	test.use({ role: 'admin' });

	test('a hand-picked badge, bulk-assigned, is awarded on save and deleted', async ({
		page,
		apiAs
	}) => {
		const name = 'E2E Hand Pick';
		await gotoReady(page, NEW);
		await page.getByLabel('Name').fill(name);
		await page.getByLabel('Problems required').fill('5');
		await page.getByText('Hand-picked', { exact: true }).click();

		// Bulk-assign: narrow to the badge olympiad, then add every match.
		await pickOlympiad(page, page.getByRole('button', { name: 'Olympiads', exact: true }), [
			BADGE_OLYMPIAD.name
		]);
		await expect(page.getByText('8 problems match')).toBeVisible();
		await page.getByRole('button', { name: 'Add all 8' }).click();
		await expect(page.getByText('8 problems selected')).toBeVisible();
		await expect(page.getByTestId('badge-available')).toHaveText('8 problems qualify right now.');

		// One off again, by its chip.
		await page.getByRole('button', { name: /^Remove Badge Physics Olympiad 2025 · Q2/ }).click();
		await expect(page.getByText('7 problems selected')).toBeVisible();

		await page.getByRole('button', { name: 'Create badge' }).click();
		// The reader has done P1 to P5, all on the list: 5 of 5, so earned.
		await expect(toast(page, 'Badge saved. 1 person holds it.')).toBeVisible();
		await expect(page).toHaveURL(/\/admin\/badges\/\d+$/);
		const id = Number(page.url().split('/').pop());
		const reader = await readerStanding(apiAs, id);
		expect(reader.count).toBe(5);
		expect(reader.earnedAt).not.toBeNull();

		// Reloaded, the selection is what was saved.
		await gotoReady(page, `/admin/badges/${id}`);
		await expect(page.getByText('7 problems selected')).toBeVisible();

		await page.getByRole('button', { name: 'Delete badge' }).click();
		await confirmDialog(page).getByRole('button', { name: 'Delete badge' }).click();
		await expect(page).toHaveURL('/admin/badges');
		await expect(page.getByRole('heading', { level: 1, name: 'Badges' })).toBeVisible();
		const list = page.getByRole('list', { name: 'Badges' });
		await expect(list).toContainText(BADGES.thermo.name);
		await expect(list).not.toContainText(name);
	});

	test('a refused save keeps what was typed', async ({ page }) => {
		await gotoReady(page, NEW);
		await page.getByLabel('Name').fill('E2E Refused');
		await page.getByText('By topic and olympiad', { exact: true }).click();
		await page.getByRole('button', { name: 'Create badge' }).click();
		await expect(
			toast(page, 'Pick at least one topic or olympiad, or choose "Every problem"')
		).toBeVisible();
		await expect(page.getByLabel('Name')).toHaveValue('E2E Refused');
		await expect(page).toHaveURL(NEW);
	});

	test('filter rules: the SQL recompute agrees with the per-user evaluation', async ({ apiAs }) => {
		const admin = await apiAs('admin');

		// Mechanics or Electromagnetism on the badge olympiad: P2, P3, P4.
		const created = await postAction(
			admin,
			`${NEW}?/save`,
			fields('E2E Field Rule', { topics: '["Mechanics","Electromagnetism"]', requiredCount: '3' }),
			{ success: true }
		);
		const id = created.data?.id as number;
		const path = `/admin/badges/${id}`;
		expect(created.data).toMatchObject({ created: true, holders: 1 });
		expect(await readerStanding(apiAs, id)).toMatchObject({ count: 3 });

		// Raised past the reader: the recompute takes it away.
		const raised = await postAction(
			admin,
			`${path}?/save`,
			fields('E2E Field Rule', { topics: '["Mechanics","Electromagnetism"]', requiredCount: '4' }),
			{ success: true }
		);
		expect(raised.data).toMatchObject({ created: false, holders: 0 });
		expect(await readerStanding(apiAs, id)).toEqual({ count: 3, earnedAt: null, revealed: null });

		// At least 85%, inclusive: P3 (17 of 20). P2 has no score and P4 no max.
		const ranged = await postAction(
			admin,
			`${path}?/save`,
			fields('E2E Field Rule', {
				topics: '["Mechanics","Electromagnetism"]',
				scoreMinPct: '85',
				requiredCount: '1'
			}),
			{ success: true }
		);
		expect(ranged.data).toMatchObject({ holders: 1 });
		expect(await readerStanding(apiAs, id)).toMatchObject({ count: 1 });

		// A ceiling below P3's 85% leaves nothing.
		const capped = await postAction(
			admin,
			`${path}?/save`,
			fields('E2E Field Rule', {
				topics: '["Mechanics","Electromagnetism"]',
				scoreMinPct: '50',
				scoreMaxPct: '84.9',
				requiredCount: '1'
			}),
			{ success: true }
		);
		expect(capped.data).toMatchObject({ holders: 0 });
		expect(await readerStanding(apiAs, id)).toEqual({ count: 0, earnedAt: null, revealed: null });

		await postAction(admin, `${path}?/delete`, {}, { redirect: '/admin/badges' });
		const gone = await admin.get(path, { maxRedirects: 0 });
		expect(gone.status()).toBe(404);
	});

	test('every problem counts towards an "all" badge', async ({ apiAs }) => {
		const admin = await apiAs('admin');
		// Out of reach for anyone, so nobody is awarded it while it exists.
		const created = await postAction(
			admin,
			`${NEW}?/save`,
			fields('E2E Everything', { scope: 'all', requiredCount: '9999' }),
			{ success: true }
		);
		const id = created.data?.id as number;
		expect(created.data).toMatchObject({ holders: 0 });
		expect(await readerStanding(apiAs, id)).toEqual({ count: 5, earnedAt: null, revealed: null });
		await postAction(admin, `/admin/badges/${id}?/delete`, {}, { redirect: '/admin/badges' });
	});

	test('a hidden requirement is a switch, shown only to admins and holders', async ({
		page,
		apiAs
	}) => {
		const admin = await apiAs('admin');
		/** The badge's id, once the first save has created it. */
		let created: number | null = null;
		const save = (requiredCount: string) =>
			postAction(
				admin,
				`${created ? `/admin/badges/${created}` : NEW}?/save`,
				fields('E2E Hidden', { topics: '["Mechanics"]', requiredCount, requirementHidden: 'on' }),
				{ success: true }
			);
		const listed = async () =>
			(
				await (await admin.get('/api/badges', { headers: { 'cache-control': 'no-cache' } })).json()
			).find((b: { id: number }) => b.id === created);
		const rule = 'Complete 2 Badge Physics Olympiad Mechanics problems';

		// Mechanics on the badge olympiad: P2 and P3, so the reader earns it, and
		// with it sees the rule. The public list still doesn't.
		const first = await save('2');
		created = first.data?.id as number;
		const path = `/admin/badges/${created}`;
		expect(first.data).toMatchObject({ holders: 1 });
		const holder = await readerStanding(apiAs, created);
		expect(holder).toMatchObject({ count: 2, revealed: { summary: rule, requiredCount: 2 } });
		expect(holder.earnedAt).not.toBeNull();
		expect(await listed()).toMatchObject({ summary: null, requiredCount: null, holders: 1 });

		// Raised past the reader: the award goes, and the rule is hidden again.
		expect((await save('3')).data).toMatchObject({ holders: 0 });
		expect(await readerStanding(apiAs, created)).toEqual({
			count: null,
			earnedAt: null,
			revealed: null
		});

		// The editor loads it switched on; switching it off and saving shows it to
		// everyone, so there is nothing left to reveal.
		await gotoReady(page, path);
		const toggle = page.getByRole('switch', { name: 'Hide the requirement' });
		await expect(toggle).toBeChecked();
		await toggle.click();
		await expect(toggle).not.toBeChecked();
		await page.getByLabel('Problems required').fill('2');
		await page.getByRole('button', { name: 'Save changes' }).click();
		await expect(toast(page, 'Badge saved. 1 person holds it.')).toBeVisible();
		expect(await readerStanding(apiAs, created)).toMatchObject({ count: 2, revealed: null });
		expect(await listed()).toMatchObject({
			summary: 'Complete 2 Badge Physics Olympiad Mechanics problems',
			requiredCount: 2
		});

		await postAction(admin, `${path}?/delete`, {}, { redirect: '/admin/badges' });
	});

	test('bad input is refused with a reason', async ({ apiAs }) => {
		const admin = await apiAs('admin');
		const refusals: [ActionFields, string][] = [
			[{ name: '' }, 'Name is required'],
			[{ icon: 'not-an-icon' }, 'Pick an icon'],
			[{ color: 'chartreuse' }, 'Pick a colour'],
			[{ requiredCount: '0' }, 'Problems required must be a whole number, at least 1'],
			[{ requiredCount: '1.5' }, 'Problems required must be a whole number, at least 1'],
			[{ scoreMinPct: '101' }, 'Minimum score must be a percentage from 0 to 100'],
			[{ scoreMinPct: '90', scoreMaxPct: '80' }, 'Minimum score must not be above the maximum'],
			[{ topics: '["Astrology"]' }, 'Unknown topic: Astrology'],
			[{ olympiadId: 'no-such-olympiad' }, 'Unknown olympiad: no-such-olympiad'],
			[
				{
					scope: 'manual',
					requiredCount: '2',
					problems: JSON.stringify([
						{ olympiadId: BADGE_OLYMPIAD.id, year: BADGE_OLYMPIAD.readerYear, number: 'P1' }
					])
				},
				'Select at least 2 problems, or lower the number required'
			],
			[
				{
					scope: 'manual',
					problems: JSON.stringify([{ olympiadId: BADGE_OLYMPIAD.id, year: 1999, number: 'X' }])
				},
				`These problems no longer exist: ${BADGE_OLYMPIAD.id} 1999 X`
			]
		];
		for (const [overrides, message] of refusals) {
			await postAction(admin, `${NEW}?/save`, fields('E2E Bad', overrides), {
				failure: 400,
				message
			});
		}
	});
});
