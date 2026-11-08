import { BADGE_OLYMPIAD, BADGES, COLLECTOR_BADGES, USERS } from '../../fixtures/seed-data';
import { expect, test } from '../../support/test';
import { gotoReady } from '../../support/ui';

/*
 * The dashboard: `/` for a signed-in visitor (src/routes/Dashboard.svelte).
 *
 * Reads USERS.badgeReader, whose progress is documented on BADGES in
 * seed-data.ts and never written. admin/badges.spec.ts creates and deletes
 * badges meanwhile, so nothing here counts every badge: earned badges are found
 * by name, and "Next up" is only checked for the seeded leader, which no badge
 * that spec creates outranks for this user.
 */

test.describe('signed out', () => {
	test('/ is still the landing page', async ({ page }) => {
		await gotoReady(page, '/');
		await expect(
			page.getByRole('heading', { level: 1, name: 'Every olympiad, one place.' })
		).toBeVisible();
		await expect(page.getByRole('heading', { name: /^Welcome back/ })).toHaveCount(0);
	});
});

test.describe('signed in', () => {
	test.use({ role: 'badgeReader' });

	test('/ is the dashboard, not the landing page', async ({ page }) => {
		await gotoReady(page, '/');
		const first = USERS.badgeReader.name.split(' ')[0];
		await expect(
			page.getByRole('heading', { level: 1, name: `Welcome back, ${first}` })
		).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Every olympiad, one place.' })).toHaveCount(0);
		await expect(page.getByRole('link', { name: 'Profile', exact: true })).toHaveAttribute(
			'href',
			'/profile'
		);
	});

	test('the headline numbers', async ({ page }) => {
		await gotoReady(page, '/');
		await expect(page.getByTestId('stat-completed')).toContainText('5');
		await expect(page.getByTestId('stat-score')).toHaveCount(0);
	});

	test('the breakdowns count each completion under each of its topics', async ({ page }) => {
		await gotoReady(page, '/');
		const topics = page.getByRole('list', { name: 'By topic' });
		// P2 is both, so it counts under each. Untagged P5 is under none.
		await expect(topics.getByRole('listitem').filter({ hasText: 'Thermodynamics' })).toContainText(
			/^Thermodynamics\s*2/
		);
		await expect(topics.getByRole('listitem').filter({ hasText: 'Mechanics' })).toContainText(
			/^Mechanics\s*2/
		);
		await expect(
			topics.getByRole('listitem').filter({ hasText: 'Electromagnetism' })
		).toContainText(/^Electromagnetism\s*1/);

		// The olympiad's total comes from /api/stats/problems: 8 frozen problems.
		const olympiads = page.getByRole('list', { name: 'By olympiad' });
		const row = olympiads.getByRole('listitem').filter({ hasText: BADGE_OLYMPIAD.name });
		await expect(row).toContainText('5 / 8');
		await expect(row.getByRole('link', { name: BADGE_OLYMPIAD.name })).toHaveAttribute(
			'href',
			`/olympiads/${BADGE_OLYMPIAD.id}`
		);
	});

	test('recent problems are listed without their topics', async ({ page }) => {
		await gotoReady(page, '/');
		const recent = page.getByRole('list', { name: 'Recent' });
		await expect(recent.getByRole('listitem')).toHaveCount(5);
		await expect(recent).toContainText('Badge One');
		// Topics are filters only, never shown next to a problem (docs/data-model.md).
		for (const topic of ['Thermodynamics', 'Mechanics', 'Electromagnetism']) {
			await expect(recent).not.toContainText(topic);
		}
		// A scored problem shows its score against the max.
		await expect(recent.getByRole('listitem').filter({ hasText: 'Badge Three' })).toContainText(
			'17 / 20'
		);
	});

	test('earned badges and the nearest unearned one', async ({ page }) => {
		await gotoReady(page, '/');
		const earned = page.getByRole('list', { name: 'Earned badges' });
		for (const badge of Object.values(BADGES)) {
			const item = earned.getByRole('listitem').filter({ hasText: badge.name });
			await expect(item, badge.name).toHaveCount(badge.earned ? 1 : 0);
		}

		// Field Worker is 3 of 4, the closest of the unearned.
		const next = page.getByRole('list', { name: 'Next up' });
		const field = next.getByRole('listitem').filter({ hasText: BADGES.field.name });
		await expect(field).toContainText(`${BADGES.field.count}/${BADGES.field.required}`);
		await expect(field.getByRole('meter')).toHaveAttribute(
			'aria-valuenow',
			String(BADGES.field.count)
		);
		await expect(page.getByRole('link', { name: 'All badges' })).toHaveAttribute('href', '/badges');
	});

	test('only the 10 most recent earned badges show until "Show more"', async ({ page }) => {
		await gotoReady(page, '/');
		const earned = page.getByRole('list', { name: 'Earned badges' });
		// At least 11 earned (admin/badges.spec.ts may award more meanwhile, all
		// newer), so the oldest collector is always past the first 10.
		const oldest = COLLECTOR_BADGES[0].name;
		await expect(earned.getByRole('listitem')).toHaveCount(10);
		await expect(earned.getByRole('link', { name: oldest, exact: true })).toHaveCount(0);

		await page.getByRole('button', { name: 'Show more' }).click();
		await expect(earned.getByRole('link', { name: oldest, exact: true })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Show more' })).toHaveCount(0);
	});

	test('a hidden requirement is never in "Next up" or the page data', async ({ page, request }) => {
		await gotoReady(page, '/');
		// At 1 of 2 it would otherwise rank third, after Field Worker and Steady Hand.
		await expect(page.getByRole('list', { name: 'Next up' })).not.toContainText(BADGES.secret.name);
		// The serialized load data, not just the markup: the rule must not be there.
		const html = await (await request.get('/')).text();
		expect(html).toContain(BADGES.secret.name);
		expect(html).not.toContain('at least 100%');
	});
});

test.describe('signed in with nothing tracked', () => {
	test.use({ role: 'user' });

	test('says so, and points to the olympiads', async ({ page }) => {
		await gotoReady(page, '/');
		await expect(page.getByText('No problems tracked yet')).toBeVisible();
		await expect(page.getByTestId('stat-completed')).toContainText('0');
		await expect(page.getByRole('list', { name: 'By topic' })).toHaveCount(0);
	});
});
