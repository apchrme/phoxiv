import { expect, type APIRequestContext } from '@playwright/test';
import { parse } from 'devalue';
import { BASE_URL } from './env';

/*
 * Posting a form action the way `use:enhance` does, without a page. For forged
 * requests (a field the UI never sends, a role that may not act) and for checks
 * that don't need the UI. See docs/testing.md, "`postAction` vs the UI".
 */

/** A file field, for multipart posts. */
export type FilePayload = { name: string; mimeType: string; buffer: Buffer };

export type ActionFields = Record<string, string | string[] | FilePayload>;

/**
 * What the action must answer. A message is required for every refusal, so a
 * test can't pass because of a different refusal (a CSRF 403, a guard instead of
 * a validation error) than the one it is about.
 *
 * - `success`: the action returned `ok()`.
 * - `failure`: it returned `actionFail(status, …, message)`. SvelteKit answers
 *   HTTP 200 with `type: 'failure'` and the status in the body.
 * - `error`: it threw `error(status, message)`, as the guards do. SvelteKit
 *   answers with that HTTP status and `type: 'error'`.
 * - `redirect`: it called `redirect(…, location)`.
 */
export type ActionExpectation =
	| { success: true }
	| { failure: number; message: string }
	| { error: number; message: string }
	| { redirect: string };

/** The parsed response, for assertions beyond the expectation. */
export type ActionResult = {
	httpStatus: number;
	type: 'success' | 'failure' | 'error' | 'redirect';
	status?: number;
	/** The action's returned envelope, devalue-decoded. */
	data?: Record<string, unknown>;
	error?: { message: string };
	location?: string;
};

function isFile(value: unknown): value is FilePayload {
	return typeof value === 'object' && value !== null && 'buffer' in value;
}

/** Field values in document order, as a browser would submit them. */
function toBody(fields: ActionFields): { form?: string; multipart?: FormData } {
	const hasFile = Object.values(fields).some(isFile);
	if (!hasFile) {
		const params = new URLSearchParams();
		for (const [name, value] of Object.entries(fields)) {
			for (const v of Array.isArray(value) ? value : [value as string]) params.append(name, v);
		}
		return { form: params.toString() };
	}
	const form = new FormData();
	for (const [name, value] of Object.entries(fields)) {
		if (isFile(value)) {
			form.append(
				name,
				new Blob([new Uint8Array(value.buffer)], { type: value.mimeType }),
				value.name
			);
		} else {
			for (const v of Array.isArray(value) ? value : [value]) form.append(name, v);
		}
	}
	return { multipart: form };
}

/**
 * POSTs `fields` to the action at `path` (`/admin?/setRole`) and asserts the
 * answer matches `expected`. `api` carries the session; get one from the `apiAs`
 * fixture, or use the `request` fixture under `test.use({ role })`.
 *
 * Sends the headers `use:enhance` sends: `x-sveltekit-action` for a JSON answer,
 * and an `Origin` matching the server, which SvelteKit's CSRF check requires.
 */
export async function postAction(
	api: APIRequestContext,
	path: string,
	fields: ActionFields,
	expected: ActionExpectation
): Promise<ActionResult> {
	const body = toBody(fields);
	const response = await api.post(path, {
		headers: {
			origin: BASE_URL,
			'x-sveltekit-action': 'true',
			accept: 'application/json',
			...(body.form !== undefined ? { 'content-type': 'application/x-www-form-urlencoded' } : {})
		},
		...(body.form !== undefined ? { data: body.form } : { multipart: body.multipart }),
		maxRedirects: 0
	});

	const text = await response.text();
	let json: Record<string, unknown>;
	try {
		json = JSON.parse(text);
	} catch {
		// A CSRF refusal or an error page is not an action answer at all.
		throw new Error(`POST ${path} did not answer as an action (${response.status()}): ${text}`);
	}

	const result: ActionResult = {
		httpStatus: response.status(),
		type: json.type as ActionResult['type'],
		status: json.status as number | undefined,
		data: typeof json.data === 'string' ? parse(json.data) : undefined,
		error: json.error as ActionResult['error'],
		location: json.location as string | undefined
	};

	const where = `POST ${path} answered ${text}`;
	if ('success' in expected) {
		expect(result.type, where).toBe('success');
		expect(result.data?.success, where).toBe(true);
	} else if ('failure' in expected) {
		expect(result.type, where).toBe('failure');
		expect(result.status, where).toBe(expected.failure);
		expect(result.data?.error, where).toBe(expected.message);
	} else if ('error' in expected) {
		expect(result.type, where).toBe('error');
		expect(result.httpStatus, where).toBe(expected.error);
		expect(result.error?.message, where).toBe(expected.message);
	} else {
		expect(result.type, where).toBe('redirect');
		expect(result.location, where).toBe(expected.redirect);
	}
	return result;
}
