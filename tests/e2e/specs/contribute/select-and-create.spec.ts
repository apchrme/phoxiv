import type { Locator, Page } from '@playwright/test';
import { parse } from 'devalue';
import { expect, test } from '../../support/test';
import { gotoReady, pickOlympiad, toast } from '../../support/ui';

/*
 * The /contribute landing page: the "New olympiad" form (`?/createOlympiad`,
 * admin-only) and the "Go to a year" form (`?/selectYear`).
 *
 * Writes only per-test olympiads, each under an id no other test uses
 * (`e2e-created-*`). Reads the frozen `alpha` and `e2e-assigned` without writing
 * them: the duplicate-id refusal comes before any write, and the contributor
 * selects a year `e2e-assigned` already has, so `ensureYear` creates nothing.
 */

/** Everything the "New olympiad" form takes except the icon file. */
type Draft = {
	id: string;
	icon: string;
	name: string;
	summary: string;
	tag: 'International' | 'Regional' | 'National' | 'Open';
	year: string;
	description: string;
};

/** A complete draft, so validation reaches the check a test is about. */
function draft(id: string, name: string): Draft {
	return {
		id,
		icon: '🧭',
		name,
		summary: `Created by contribute/select-and-create.spec.ts as ${id}.`,
		tag: 'National',
		year: '2024',
		description: 'A **created** olympiad.'
	};
}

/** The id-format refusal in `createOlympiad` (contribute/+page.server.ts). */
const ID_FORMAT_ERROR =
	'The ID may use only lowercase letters, digits and hyphens (at most 32), and cannot start with a hyphen';

/** The "New olympiad" form's controls, by their labels. */
function newOlympiadForm(page: Page) {
	return {
		// Anchored: "Icon image (optional — overrides emoji)" contains "id" too.
		id: page.getByLabel(/^ID/),
		icon: page.getByLabel(/^Emoji icon/),
		name: page.getByLabel(/^Full name/),
		summary: page.getByLabel(/^Summary/),
		// A bits-ui select: its trigger is a combobox named by `aria-label` (TagSelect.svelte).
		tag: page.getByRole('combobox', { name: 'Tag', exact: true }),
		year: page.getByLabel(/^First year/),
		description: page.getByLabel(/^Description/),
		submit: page.getByRole('button', { name: 'Create olympiad' })
	};
}

/** Opens /contribute on the "New olympiad" tab. */
async function openNewOlympiad(page: Page): Promise<void> {
	await gotoReady(page, '/contribute');
	const tab = page.getByRole('tab', { name: 'New olympiad' });
	await tab.click();
	await expect(tab).toHaveAttribute('aria-selected', 'true');
}

async function fillDraft(page: Page, values: Draft): Promise<void> {
	const form = newOlympiadForm(page);
	await form.id.fill(values.id);
	await form.icon.fill(values.icon);
	await form.name.fill(values.name);
	await form.summary.fill(values.summary);
	await form.tag.click();
	// The listbox is portalled to the end of `<body>`, so it is found from `page`.
	await page.getByRole('option', { name: values.tag, exact: true }).click();
	await expect(form.tag).toHaveText(values.tag);
	await form.year.fill(values.year);
	await form.description.fill(values.description);
}

/** Every field still holds what was typed, and the form can be sent again. */
async function expectDraftKept(page: Page, values: Draft): Promise<void> {
	const form = newOlympiadForm(page);
	await expect(page).toHaveURL('/contribute');
	await expect(page.getByRole('tab', { name: 'New olympiad' })).toHaveAttribute(
		'aria-selected',
		'true'
	);
	await expect(form.id).toHaveValue(values.id);
	await expect(form.icon).toHaveValue(values.icon);
	await expect(form.name).toHaveValue(values.name);
	await expect(form.summary).toHaveValue(values.summary);
	await expect(form.tag).toHaveText(values.tag);
	await expect(form.year).toHaveValue(values.year);
	await expect(form.description).toHaveValue(values.description);
	// The page's `Pending` cleared, so the button isn't stuck on "Creating…".
	await expect(form.submit).toBeEnabled();
}

/**
 * Submits through `submit` and expects `createOlympiad` to refuse with
 * `actionFail(status, …, message)`, and the page to toast the message.
 *
 * `actionFail()` answers with its status and `type: 'failure'`; `error()` would
 * answer `type: 'error'` and replace the page, discarding what was typed
 * (#lib/server/forms.ts, `actionFail`: "`error()` replaces the page and discards
 * what the user typed"; CLAUDE.md rule 6).
 */
async function expectCreateRefused(
	page: Page,
	submit: Locator,
	status: number,
	message: string
): Promise<void> {
	const answer = page.waitForResponse(
		(response) =>
			response.request().method() === 'POST' &&
			new URL(response.url()).search === '?/createOlympiad'
	);
	await submit.click();
	const response = await answer;
	const body = (await response.json()) as { type: string; status: number; data: string };
	expect(response.status()).toBe(status);
	expect(body.type).toBe('failure');
	expect(body.status).toBe(status);
	expect((parse(body.data) as { error: string }).error).toBe(message);
	// Toasts vanish after four seconds, so straight after the answer.
	await expect(toast(page, message)).toBeVisible();
}

test.describe('an admin, on the "New olympiad" form', () => {
	test.use({ role: 'admin' });

	test('creates an olympiad and lands on its first year', async ({ page }) => {
		const values = draft('e2e-created-a', 'Created Physics Olympiad A');
		await openNewOlympiad(page);
		await fillDraft(page, values);
		await newOlympiadForm(page).submit.click();

		// The tag reached the server, or this would be "All required fields must be
		// filled in": NewOlympiadForm.svelte, "`TagSelect` must stay inside the
		// `<form>`: it submits via a hidden input".
		await expect(page).toHaveURL(`/contribute/${values.id}/${values.year}`);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(
			`${values.name} ${values.year}`
		);
		await expect(page.getByText(`Editing ${values.id}/${values.year}`)).toBeVisible();

		// Every field was saved: the olympiad editor (never cached) shows them back.
		await page.getByRole('link', { name: `Back to ${values.name}` }).click();
		await expect(page).toHaveURL(`/contribute/${values.id}`);
		await expect(page.getByLabel(/^Full name/)).toHaveValue(values.name);
		await expect(page.getByLabel(/^Summary/)).toHaveValue(values.summary);
		await expect(page.getByLabel(/^Emoji icon/)).toHaveValue(values.icon);
		await expect(page.getByRole('combobox', { name: 'Tag', exact: true })).toHaveText(values.tag);
		await expect(page.getByPlaceholder('Write a longer description using Markdown…')).toHaveValue(
			values.description
		);
	});

	test('is refused a duplicate id, and keeps everything typed', async ({ page }) => {
		// `alpha` is frozen. The duplicate check comes before the icon upload and the
		// insert ("Check before uploading", contribute/+page.server.ts), so nothing
		// is written to it.
		const values = draft('alpha', 'Duplicate Physics Olympiad');
		await openNewOlympiad(page);
		await fillDraft(page, values);
		await expectCreateRefused(
			page,
			newOlympiadForm(page).submit,
			400,
			'An olympiad with the ID "alpha" already exists'
		);
		await expectDraftKept(page, values);
	});

	// "Anything else (`/`, `?`, `#`, `.`) would break URLs and R2 keys"
	// (contribute/+page.server.ts). The input has no `pattern`, so the browser
	// sends these and the server is the only check.
	for (const [what, id] of [
		['a slash', 'e2e-created-b/2'],
		['a dot', 'e2e-created-c.2']
	] as const) {
		test(`is refused an id with ${what}, and keeps everything typed`, async ({ page }) => {
			const values = draft(id, `Malformed Physics Olympiad (${what})`);
			await openNewOlympiad(page);
			await fillDraft(page, values);
			await expectCreateRefused(page, newOlympiadForm(page).submit, 400, ID_FORMAT_ERROR);
			await expectDraftKept(page, values);
		});
	}
});

test.describe('a contributor, on /contribute', () => {
	test.use({ role: 'contributor' });

	test('has no "New olympiad" tab', async ({ page }) => {
		// contribute/+page.svelte: "`createOlympiad` is admin-only, so contributors
		// don't get a form that always fails."
		await gotoReady(page, '/contribute');
		await expect(page.getByRole('tab', { name: 'Existing olympiad' })).toBeVisible();
		await expect(page.getByRole('tab', { name: 'New olympiad' })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Create olympiad' })).toHaveCount(0);
	});

	test('picks their olympiad and an existing year, and reaches its editor', async ({ page }) => {
		await gotoReady(page, '/contribute');
		const picker = page.getByRole('button', { name: 'Olympiad', exact: true });

		// The load lists only the olympiads this user may edit.
		await picker.click();
		await expect(
			page.getByRole('option', { name: 'Assigned Physics Olympiad', exact: true })
		).toBeVisible();
		await expect(
			page.getByRole('option', { name: 'Alpha Physics Olympiad', exact: true })
		).toHaveCount(0);
		await page.keyboard.press('Escape');
		await expect(page.getByPlaceholder('Search olympiads…')).toBeHidden();

		await pickOlympiad(page, picker, 'Assigned Physics Olympiad');
		await expect(picker).toContainText('Assigned Physics Olympiad');
		// 2018 already exists, so `ensureYear` writes nothing to the frozen olympiad.
		await page.getByLabel(/^Year/).fill('2018');
		await page.getByRole('button', { name: 'Go', exact: true }).click();

		// The pick reached the server, or this would be "Please select an olympiad":
		// SelectYearForm.svelte, "`OlympiadPicker` must stay inside the `<form>`: it
		// submits via a hidden input".
		await expect(page).toHaveURL('/contribute/e2e-assigned/2018');
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(
			'Assigned Physics Olympiad 2018'
		);
		await expect(page.getByLabel('Problem 1 number')).toHaveValue('P1');
		await expect(page.getByLabel('Problem 1 title')).toHaveValue('Assigned Problem');
	});
});
