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
 * The backfill's two halves: hand out the pending list, accept the results.
 *
 * **The Worker never parses anything here.** `bun run index:backfill` runs on a
 * maintainer's machine, where dependency weight is free — which is also why the
 * script can cover `.docx`/`.xlsx` that the browser path skips. All this endpoint
 * does is expose the derived work queue and write what comes back.
 *
 * There is deliberately **no `indexBatch` action and no batch button**: with the
 * parsing outside, there is nothing for the Worker to loop over, which also
 * sidesteps the infinite-submit-loop shape CLAUDE.md rule 8 records in this exact
 * panel. The admin page is read-only reporting plus three index-maintenance
 * actions.
 *
 * **`requireAdmin` is called here, not inherited.** A `+server.ts` runs no layout
 * loads, so `admin/+layout.server.ts` does not cover it — the same reason
 * `contribute/[olympiad]/titles.csv/+server.ts` guards itself.
 *
 * Authentication is the ordinary session cookie, copied from a signed-in browser
 * into `PHOXIV_SESSION`. Clunky, and deliberately so: a shared-secret header
 * would be a second authentication mechanism in a codebase whose `docs/auth.md`
 * is narrow on purpose, and this adds no new secret and no new auth path.
 *
 * No cache headers, like everything else under `/admin`.
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
 * The candidates the caller should extract next, plus how many are left overall.
 *
 * `exts` is the caller's **own** extractable list, which is what lets a wider
 * extractor pick up rows a narrower one marked `skipped` — see
 * {@link selectIndexCandidates}.
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

	return json({
		extractorVersion: EXTRACTOR_VERSION,
		...(await selectIndexCandidates(db, { exts, limit }))
	});
};

/**
 * Writes a batch of extraction results.
 *
 * **The server re-runs `normalizeExtracted` on every posted text**, exactly as
 * `uploadFile` does and for exactly the same reason: it is what strips the
 * U+0002/U+0003 snippet sentinels so they cannot be forged into a result row, and
 * what applies the character cap. The script is trusted the way an admin is
 * trusted, which is not the same as its output being trusted verbatim.
 *
 * One `index_files` log row per batch, never one per file.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const { db, user } = requireAdmin(locals);

	const body = (await request.json().catch(() => null)) as { results?: PostedResult[] } | null;
	const posted = Array.isArray(body?.results) ? body.results : [];

	const counts: Record<string, number> = {};
	let written = 0;

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
					// The script said `ok` but there is nothing usable in it. `empty` is
					// the honest status, and it keeps the scan count truthful.
					write = { ...write, status: 'empty' };
				} else {
					const { text, truncated } = capExtracted(normalized);
					write = { ...write, text, chars: text.length, truncated };
				}
			}
		}

		await writeFileText(db, write);
		counts[write.status] = (counts[write.status] ?? 0) + 1;
		written++;
	}

	if (written > 0) {
		const summary = Object.entries(counts)
			.map(([status, n]) => `${n} ${status}`)
			.join(', ');
		await logActivity(db, user, 'index_files', `Indexed ${written} files (${summary})`);
	}

	return json({ written, counts });
};
