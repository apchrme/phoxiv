/**
 * The one-time backfill of the existing corpus, run from a maintainer's machine.
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
 * **Never imported by application code**, exactly like `auth-cli.ts` beside it —
 * same `-cli` suffix, same rule. It lives under `src/lib/server/` rather than in
 * a top-level `scripts/` directory for a reason that is not cosmetic:
 * `.svelte-kit/tsconfig.json`'s `include` covers `../src/**` but **not** a
 * top-level `scripts/`, so a script there would be linted by eslint yet invisible
 * to `bun run check` — a silent hole in a project whose only safety net is
 * `svelte-check` plus a click-through.
 *
 * # Why the work happens here and not in the Worker
 *
 * Locally, dependency weight is free. That is what lets this cover `.docx` and
 * `.xlsx` — zips of XML — which the browser path deliberately skips, and it is
 * why `unpdf` and `fflate` are **devDependencies**: they never enter either
 * bundle.
 *
 * # Why results travel over HTTP rather than `wrangler d1 execute`
 *
 * `wrangler d1 execute` is unusable for 40 kB–500 kB texts: D1 caps a *statement*
 * at 100 KB, and `--command` additionally hits Windows' 8191-character
 * command-line limit. Posting to `/admin/reindex` sends the text as a **bound
 * parameter** instead, so only D1's 2 MB row limit applies.
 *
 * # Where the bytes come from
 *
 * The local `files/` rclone mirror first — `docs/deployment.md` already documents
 * it as a scratch copy of the bucket — falling back to a plain `fetch` of the
 * public CDN url. Either way **no R2 credentials are needed**.
 *
 * # Authentication
 *
 * The ordinary session cookie, copied out of a signed-in admin's browser.
 * Clunky, and deliberate: a shared-secret header would be a second
 * authentication mechanism in a codebase whose `docs/auth.md` is narrow on
 * purpose, and this adds no new secret and no new auth path.
 *
 * **The cookie is not called the same thing in both places.** BetterAuth adds the
 * `__Secure-` prefix whenever it believes it is in production, so `phoxiv.org`
 * sets `__Secure-better-auth.session_token` while `bun run dev` sets the bare
 * `better-auth.session_token`. Nothing here can tell which name the target
 * expects, and getting it wrong is invisible: the Worker simply sees no session
 * and `requireAdmin` returns 403, exactly as it would for a non-admin. So
 * {@link authHeaders} sends the value under **both** names — a server reads only
 * the one it asked for and ignores the other.
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
 * What this script can read, which is deliberately **wider** than the browser's
 * `EXTRACTABLE_EXTS`.
 *
 * The endpoint takes this list and re-queues rows a narrower extractor already
 * marked `skipped`, so adding an extension here is all it takes to sweep up the
 * files that were passed over. `.zip` and legacy `.doc` are in nobody's list and
 * therefore converge to `skipped` forever, which is the intent.
 */
const EXTS = ['pdf', 'htm', 'html', 'docx', 'xlsx'] as const;

const ENGINE = 'cli-unpdf';

/** Batch sizes. Small enough that one POST body stays well under a megabyte. */
const FETCH_BATCH = 20;
const POST_BATCH = 20;
/** Parsing is local and CPU-bound; four at a time saturates a laptop nicely. */
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

/**
 * The cookie value, tolerant of what actually arrives on a clipboard: wrapping
 * quotes, stray whitespace, and a whole `name=value` pair copied out of a
 * devtools row rather than the value on its own.
 */
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

/** Both spellings, for the reason recorded in the header. */
const COOKIE_NAMES = ['better-auth.session_token', '__Secure-better-auth.session_token'];

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
	return { cookie: COOKIE_NAMES.map((name) => `${name}=${SESSION}`).join('; '), ...extra };
}

/**
 * A failed response as one line, **body included**.
 *
 * The status on its own is not actionable. A 403 from `requireAdmin` and a 403
 * from a Cloudflare rule are the same three digits until you can see that one
 * says `{"message":"Unauthorised"}` and the other is a Ray ID wrapped in HTML.
 */
async function describe(res: Response): Promise<string> {
	const body = (await res.text().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 300);
	return body ? `HTTP ${res.status} — ${body}` : `HTTP ${res.status}`;
}

/**
 * Who the cookie authenticates as, asked once before any work is fetched.
 *
 * `requireAdmin` answers "there is no session" and "there is one, but it is not
 * an admin's" with the same `error(403, 'Unauthorised')` — right for a guard,
 * useless for a script. BetterAuth's own session endpoint separates the two, so
 * one extra request turns a blind 403 into a message that names the cause.
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
 * One page of work, and with `withCount` how much is left across the archive.
 *
 * The count is asked for **once per sweep**, on the first page: it is a whole-union
 * `count(*)` on the server, far dearer than the page of candidates beside it, and
 * it feeds nothing but the progress line below. See `selectIndexCandidates`.
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
 * The object's bytes, from the local mirror if it is there and from the CDN
 * otherwise.
 *
 * The mirror's layout **is** the key layout — `docs/deployment.md` says so — so
 * stripping `CDN_BASE_URL` off the url yields the relative path under `files/`.
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
 * The text of an Office Open XML file.
 *
 * `.docx` and `.xlsx` are zips of XML, so this is a zip read plus the same tag
 * strip — no Office library, and nothing that could ever end up in a bundle. For
 * `.xlsx` the strings live in one shared table, which is why that one file is
 * enough.
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

		// Capped here as well as server-side, so the POST body stays small. The
		// server re-normalises and re-caps regardless — that is the security step,
		// not a duplicate of this one.
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
	 * The progress countdown, asked of the server **once** and decremented here.
	 *
	 * Approximate on purpose, which is why it prints with a `~`: a retryable
	 * failure re-enters the queue, so the true figure can fall more slowly than
	 * this does. The loop's termination never depends on it — `candidates.length`
	 * is the only authority on whether work is left — so drift costs nothing but
	 * the precision of a log line, and it saves a whole-union `count(*)` per page.
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
