import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requireAdmin } from '$lib/server/guard';
import { logActivity } from '$lib/server/activity-log';
import {
	selectIndexCandidates,
	writeFileText,
	type FileTextWrite
} from '$lib/server/db/queries/files';
import {
	capExtracted,
	EXTRACTOR_VERSION,
	MAX_SUBMITTED_TEXT_CHARS,
	MIN_EXTRACTED_CHARS,
	normalizeExtracted
} from '$lib/search';
import { extensionOf } from '$lib/uploads';

/**
 * The backfill endpoint for `bun run index:backfill` (`reindex-cli.ts`): GET
 * hands out the pending list, POST accepts results. The Worker never parses a
 * file here; extraction happens on the maintainer's machine. Don't add a
 * batch-indexing action to the admin panel: a self-resubmitting form there once
 * looped forever.
 *
 * `requireAdmin` is called here because a `+server.ts` runs no layout loads, so
 * `admin/+layout.server.ts` does not cover it.
 *
 * Auth is the ordinary session cookie, so there is no second auth mechanism. No
 * cache headers, like everything under `/admin`.
 */

/** Batch sizes the script may ask for. Bounded so one request stays small. */
const MAX_CANDIDATES = 200;
const DEFAULT_CANDIDATES = 50;

/** What the script may post back per file. Everything but `url` is optional. */
type PostedResult = {
	url?: unknown;
	status?: unknown;
	text?: unknown;
	etag?: unknown;
	bytes?: unknown;
	error?: unknown;
	engine?: unknown;
};

const STATUSES = ['pending', 'ok', 'empty', 'skipped', 'error'] as const;
type Status = (typeof STATUSES)[number];

function asStatus(value: unknown): Status {
	return (STATUSES as readonly unknown[]).includes(value) ? (value as Status) : 'error';
}

/**
 * The next candidates to extract and, only with `?count=1`, how many are left.
 *
 * `exts` is the caller's own extractable list, so a wider extractor can pick up
 * rows a narrower one marked `skipped`. The count is expensive, so it is
 * opt-in; callers must loop on `candidates.length`, not `remaining`.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	const { db } = requireAdmin(locals);

	const exts = (url.searchParams.get('exts') ?? 'pdf,htm,html')
		.split(',')
		.map((e) => e.trim().toLowerCase())
		.filter(Boolean);
	const requested = Number(url.searchParams.get('limit') ?? DEFAULT_CANDIDATES);
	const limit = Number.isFinite(requested)
		? Math.min(Math.max(Math.trunc(requested), 1), MAX_CANDIDATES)
		: DEFAULT_CANDIDATES;

	const withCount = url.searchParams.get('count') === '1';

	return json({
		extractorVersion: EXTRACTOR_VERSION,
		...(await selectIndexCandidates(db, { exts, limit, withCount }))
	});
};

/**
 * Writes a batch of extraction results. The posted text is re-normalised, as in
 * `uploadFile`: that strips forged STX/ETX snippet sentinels. The script is
 * trusted like an admin, but its output is not taken verbatim.
 *
 * One `index_files` log row per batch, never one per file.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const { db, user } = requireAdmin(locals);

	const body = (await request.json().catch(() => null)) as { results?: PostedResult[] } | null;
	const posted = Array.isArray(body?.results) ? body.results : [];

	const counts: Record<string, number> = {};
	let written = 0;
	const failed: string[] = [];

	for (const result of posted) {
		if (typeof result?.url !== 'string' || !result.url) continue;
		const url = result.url;
		const ext = extensionOf(url);
		const status = asStatus(result.status);

		let write: FileTextWrite = {
			url,
			ext,
			status,
			etag: typeof result.etag === 'string' ? result.etag : null,
			bytes: typeof result.bytes === 'number' ? result.bytes : null,
			engine: typeof result.engine === 'string' ? result.engine : '',
			error: typeof result.error === 'string' ? result.error : null
		};

		if (status === 'ok') {
			const raw = typeof result.text === 'string' ? result.text : '';
			if (raw.length > MAX_SUBMITTED_TEXT_CHARS) {
				write = { ...write, status: 'error', error: `Text too large (${raw.length} chars)` };
			} else {
				const normalized = normalizeExtracted(raw);
				if (normalized.length < MIN_EXTRACTED_CHARS) {
					// Posted as `ok` but too short to use: record it as `empty`.
					write = { ...write, status: 'empty' };
				} else {
					const { text, truncated } = capExtracted(normalized);
					write = { ...write, text, chars: text.length, truncated };
				}
			}
		}

		// One D1 error must not lose the rest of the batch. A failed row stays
		// pending, so the script is told and stops rather than refetching it forever.
		try {
			await writeFileText(db, write);
		} catch (err) {
			console.error(`reindex: writing ${url} failed:`, err);
			failed.push(url);
			continue;
		}
		counts[write.status] = (counts[write.status] ?? 0) + 1;
		written++;
	}

	if (written > 0) {
		const summary = Object.entries(counts)
			.map(([status, n]) => `${n} ${status}`)
			.join(', ');
		await logActivity(db, user, 'index_files', `Indexed ${written} files (${summary})`);
	}

	return json({ written, counts, failed });
};
