/**
 * Backfills the index for the existing corpus, run from a maintainer's machine.
 *
 * ```sh
 * PHOXIV_URL=https://phoxiv.org PHOXIV_SESSION='<cookie value>' bun run index:backfill
 * ```
 *
 * ```powershell
 * # PowerShell has no inline env-var prefix, so the line above is a parse error there
 * $env:PHOXIV_URL = 'https://phoxiv.org'; $env:PHOXIV_SESSION = '<cookie value>'; bun run index:backfill
 * ```
 *
 * Never imported by application code (like `auth-cli.ts`). It lives under
 * `src/` rather than `scripts/` so `bun run check` type-checks it.
 *
 * Extraction runs locally, so heavy devDependencies (`unpdf`, `fflate`) never
 * enter a bundle, and it can read `.docx`/`.xlsx`, which the browser skips.
 *
 * Results are POSTed to `/admin/reindex`, where the text is a bound parameter.
 * Don't use `wrangler d1 execute`: D1 caps a statement at 100 KB.
 *
 * Bytes come from the local `files/` rclone mirror, else the public CDN, so no
 * R2 credentials are needed.
 *
 * Auth is the ordinary session cookie of a signed-in admin, so there is no
 * second auth mechanism. BetterAuth names it `__Secure-better-auth.session_token`
 * in production and `better-auth.session_token` in dev, and a wrong name is a
 * silent 403, so {@link authHeaders} sends both.
 */

import { readFile } from 'node:fs/promises';
import { extractText as unpdfExtract, getDocumentProxy } from 'unpdf';
import { unzipSync, strFromU8 } from 'fflate';
import {
	capExtracted,
	MAX_SUBMITTED_TEXT_CHARS,
	MIN_EXTRACTED_CHARS,
	normalizeExtracted
} from '$lib/search';
import { CDN_BASE_URL } from '$lib/constants';
import { extensionOf } from '$lib/uploads';

/**
 * What this script can read, wider than the browser's `EXTRACTABLE_EXTS`. The
 * endpoint re-queues `skipped` rows with these extensions, so adding one here
 * sweeps up files the browser passed over.
 */
const EXTS = ['pdf', 'htm', 'html', 'docx', 'xlsx'] as const;

const ENGINE = 'cli-unpdf';

/** Batch sizes. Small enough that one POST body stays well under a megabyte. */
const FETCH_BATCH = 20;
const POST_BATCH = 20;
/** Parsing is local and CPU-bound. */
const CONCURRENCY = 4;

type Candidate = { url: string; ext: string };

type Result = {
	url: string;
	status: 'ok' | 'empty' | 'skipped' | 'error';
	text?: string;
	etag?: string | null;
	bytes?: number | null;
	engine?: string;
	error?: string;
};

const BASE = (process.env.PHOXIV_URL ?? 'http://localhost:5173').replace(/\/+$/, '');

/** The cookie value, tolerating quotes, whitespace, or a pasted `name=value` pair. */
const SESSION = (process.env.PHOXIV_SESSION ?? '')
	.trim()
	.replace(/^['"]|['"]$/g, '')
	.replace(/^(?:__Secure-)?better-auth\.session_token=/, '')
	.trim();

if (!SESSION) {
	console.error(
		'PHOXIV_SESSION is required: copy the session cookie from a signed-in admin browser.\n' +
			'  phoxiv.org  → __Secure-better-auth.session_token\n' +
			'  localhost   → better-auth.session_token'
	);
	process.exit(1);
}

/** Both names; see the header. */
const COOKIE_NAMES = ['better-auth.session_token', '__Secure-better-auth.session_token'];

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
	return { cookie: COOKIE_NAMES.map((name) => `${name}=${SESSION}`).join('; '), ...extra };
}

/**
 * A failed response as one line, body included: a 403 from `requireAdmin` and
 * one from a Cloudflare rule look the same without it.
 */
async function describe(res: Response): Promise<string> {
	const body = (await res.text().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 300);
	return body ? `HTTP ${res.status} — ${body}` : `HTTP ${res.status}`;
}

/**
 * Who the cookie authenticates as, checked before any work. `requireAdmin`
 * returns the same 403 for "no session" and "not an admin"; this tells them
 * apart.
 */
async function whoami(): Promise<{ email?: string; role?: string } | null> {
	const res = await fetch(`${BASE}/api/auth/get-session`, { headers: authHeaders() });
	if (!res.ok) throw new Error(`GET /api/auth/get-session → ${await describe(res)}`);
	const body = (await res.json().catch(() => null)) as {
		user?: { email?: string; role?: string };
	} | null;
	return body?.user ?? null;
}

/**
 * One page of work and, with `withCount`, how much is left. Ask for the count
 * only once per sweep: it is expensive on the server and only feeds the
 * progress line.
 */
async function fetchCandidates(
	withCount = false
): Promise<{ candidates: Candidate[]; remaining?: number }> {
	const url =
		`${BASE}/admin/reindex?limit=${FETCH_BATCH}&exts=${EXTS.join(',')}` +
		(withCount ? '&count=1' : '');
	const res = await fetch(url, { headers: authHeaders() });
	if (!res.ok) throw new Error(`GET /admin/reindex → ${await describe(res)}`);
	return res.json() as Promise<{ candidates: Candidate[]; remaining?: number }>;
}

async function postResults(results: Result[]): Promise<{ written: number }> {
	const res = await fetch(`${BASE}/admin/reindex`, {
		method: 'POST',
		headers: authHeaders({ 'content-type': 'application/json' }),
		body: JSON.stringify({ results })
	});
	if (!res.ok) throw new Error(`POST /admin/reindex → ${await describe(res)}`);
	return res.json() as Promise<{ written: number }>;
}

/**
 * The object's bytes, from the local mirror if present, else the CDN. The
 * mirror uses the R2 key layout, so the url minus `CDN_BASE_URL` is its path
 * under `files/`.
 */
async function readBytes(url: string): Promise<{ data: Uint8Array; etag: string | null }> {
	const key = url.startsWith(`${CDN_BASE_URL}/`) ? url.slice(CDN_BASE_URL.length + 1) : null;
	if (key) {
		try {
			return { data: new Uint8Array(await readFile(`files/${key}`)), etag: null };
		} catch {
			// Not mirrored locally; fall through to the CDN.
		}
	}
	const res = await fetch(url);
	if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
	return {
		data: new Uint8Array(await res.arrayBuffer()),
		etag: res.headers.get('etag')
	};
}

async function extractPdf(data: Uint8Array): Promise<string> {
	const doc = await getDocumentProxy(data);
	const { text } = await unpdfExtract(doc, { mergePages: true });
	return Array.isArray(text) ? text.join('\n') : text;
}

/** Tags stripped without a DOM, since there is none here. */
function extractHtml(data: Uint8Array): string {
	return strFromU8(data)
		.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
		.replace(/<[^>]+>/g, ' ');
}

/**
 * The text of a `.docx` or `.xlsx`: both are zips of XML, so unzip and strip
 * tags. An `.xlsx` keeps most strings in `sharedStrings.xml`.
 */
function extractOoxml(data: Uint8Array, ext: string): string {
	const files = unzipSync(data);
	const wanted =
		ext === 'docx'
			? ['word/document.xml']
			: [
					'xl/sharedStrings.xml',
					...Object.keys(files).filter((n) => n.startsWith('xl/worksheets/'))
				];

	let out = '';
	for (const name of wanted) {
		const entry = files[name];
		if (!entry) continue;
		out += strFromU8(entry).replace(/<[^>]+>/g, ' ') + '\n';
	}
	return out;
}

async function extractOne(candidate: Candidate): Promise<Result> {
	const ext = candidate.ext || extensionOf(candidate.url);
	if (!(EXTS as readonly string[]).includes(ext)) {
		return { url: candidate.url, status: 'skipped', engine: ENGINE };
	}

	try {
		const { data, etag } = await readBytes(candidate.url);
		const raw =
			ext === 'pdf'
				? await extractPdf(data)
				: ext === 'htm' || ext === 'html'
					? extractHtml(data)
					: extractOoxml(data, ext);

		const normalized = normalizeExtracted(raw);
		if (normalized.length < MIN_EXTRACTED_CHARS) {
			return { url: candidate.url, status: 'empty', etag, bytes: data.length, engine: ENGINE };
		}

		// Capped here only to keep the POST small. The server re-normalises and
		// re-caps regardless; that is the security step.
		const { text } = capExtracted(normalized);
		return {
			url: candidate.url,
			status: 'ok',
			text: text.slice(0, MAX_SUBMITTED_TEXT_CHARS),
			etag,
			bytes: data.length,
			engine: ENGINE
		};
	} catch (e) {
		return {
			url: candidate.url,
			status: 'error',
			engine: ENGINE,
			error: e instanceof Error ? e.message : 'Extraction failed'
		};
	}
}

/** `CONCURRENCY` workers pulling from one shared list. */
async function extractAll(candidates: Candidate[]): Promise<Result[]> {
	const results: Result[] = [];
	let next = 0;
	await Promise.all(
		Array.from({ length: Math.min(CONCURRENCY, candidates.length) }, async () => {
			for (;;) {
				const i = next++;
				if (i >= candidates.length) return;
				results.push(await extractOne(candidates[i]));
			}
		})
	);
	return results;
}

async function main() {
	const me = await whoami();
	if (!me) {
		console.error(
			`${BASE} did not recognise that session cookie, so every request would come back 403.\n` +
				'  · Copy the value only, from the cookie named for that origin (see the note above).\n' +
				'  · It has to come from the same origin you are pointing at — a localhost session\n' +
				'    token means nothing to phoxiv.org, and vice versa.\n' +
				'  · Sessions expire; sign in again and re-copy if this one is old.'
		);
		process.exit(1);
	}
	if (me.role !== 'admin') {
		console.error(
			`Signed in as ${me.email ?? 'an unknown account'} with role "${me.role ?? 'user'}". ` +
				'/admin/reindex requires an admin.'
		);
		process.exit(1);
	}

	console.log(`Backfilling ${BASE} as ${me.email ?? 'admin'} …`);
	let done = 0;
	let counted = false;
	/**
	 * Progress countdown, fetched once and decremented locally. Approximate
	 * (retries re-enter the queue), hence the `~`. The loop ends on
	 * `candidates.length`, never on this.
	 */
	let left: number | undefined;

	for (;;) {
		const { candidates, remaining } = await fetchCandidates(!counted);
		if (!counted) {
			left = remaining;
			counted = true;
		}

		if (candidates.length === 0) {
			console.log(`Nothing left to index. ${done} files processed this run.`);
			return;
		}

		const results = await extractAll(candidates);
		for (let i = 0; i < results.length; i += POST_BATCH) {
			const { written } = await postResults(results.slice(i, i + POST_BATCH));
			done += written;
		}

		if (left !== undefined) left = Math.max(left - candidates.length, 0);

		const tally = results.reduce<Record<string, number>>((acc, r) => {
			acc[r.status] = (acc[r.status] ?? 0) + 1;
			return acc;
		}, {});
		console.log(
			`${done} done${left === undefined ? '' : `, ~${left} remaining`} — ` +
				Object.entries(tally)
					.map(([s, n]) => `${n} ${s}`)
					.join(', ')
		);
	}
}

await main();
