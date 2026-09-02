import { capExtracted, MIN_EXTRACTED_CHARS, normalizeExtracted, TEXT_CHAR_CAP } from '$lib/search';
import { extensionOf, isExtractable } from '$lib/uploads';

/**
 * Text extraction, **in the contributor's browser**.
 *
 * # Why it is not in the Worker
 *
 * No `ai` binding, no PDF library in the Worker, no `wrangler.jsonc` change at
 * all. The reason is measured rather than aesthetic: the entire phoXiv server
 * bundle is about 1.7 MB raw / 0.38 MB gzipped, and pdf.js is roughly 1.7 MB
 * minified (~+0.5 MB gzipped). Putting it in the Worker would make the PDF
 * parser larger than the rest of the application and charge that to cold-start
 * parse time on *every* route, to serve a path that runs a few times a month. It
 * would fit inside the 10 MB limit; it is simply disproportionate.
 *
 * It also pays a dividend the server could never pay: extraction runs on
 * file-pick, so the editor can say "no text found — this looks like a scanned
 * PDF" while the contributor can still swap the file, instead of leaving it to
 * an admin to notice a counter afterwards.
 *
 * # This module is browser-only
 *
 * Nothing under `$lib/server/` may import it, and nothing does. The constants and
 * the normaliser it uses live in `$lib/search.ts` precisely so the server and the
 * backfill script can share them without dragging this file into their bundles.
 */

/**
 * Where the parser comes from, and the one thing that must not be "tidied".
 *
 * A **runtime string URL**, dynamic-imported with `@vite-ignore`. That is the
 * whole point: Vite must not resolve this at build time, because a resolved
 * dynamic import joins the module graph and Rollup emits it into the *server*
 * build too — which `adapter-cloudflare` then bundles into the Worker, which is
 * the one thing this design exists to avoid. A runtime string is the only form
 * guaranteed absent from both bundles.
 *
 * The files are served by the `ASSETS` binding out of `static/vendor/pdfjs/`, so
 * they are static assets and not Worker script size. See the README beside them
 * for the pinned version, and `docs/deployment.md` for the one-command bundle
 * check that keeps this honest.
 */
const PDFJS_URL = '/vendor/pdfjs/pdf.min.mjs';
const PDFJS_WORKER_URL = '/vendor/pdfjs/pdf.worker.min.mjs';

/** The subset of pdf.js's surface this module uses. */
type PdfTextItem = { str?: string; hasEOL?: boolean };
type PdfPage = { getTextContent(): Promise<{ items: unknown[] }> };
type PdfDocument = {
	numPages: number;
	getPage(n: number): Promise<PdfPage>;
	destroy(): Promise<void>;
};
type PdfjsModule = {
	GlobalWorkerOptions: { workerSrc: string };
	getDocument(src: { data: ArrayBuffer; isEvalSupported: boolean }): {
		promise: Promise<PdfDocument>;
	};
};

/**
 * The result of one extraction attempt. There is no `throw` path — see
 * {@link extractText}.
 */
export type Extraction =
	| { status: 'ok'; text: string; chars: number; truncated: boolean; pages: number }
	| { status: 'empty'; pages: number }
	| { status: 'skipped' }
	| { status: 'error'; error: string };

/** Loaded once per page, not once per file: the worker is expensive to spin up. */
let pdfjsPromise: Promise<PdfjsModule> | null = null;

function loadPdfjs(): Promise<PdfjsModule> {
	pdfjsPromise ??= import(/* @vite-ignore */ PDFJS_URL).then((mod) => {
		const pdfjs = mod as unknown as PdfjsModule;
		pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
		return pdfjs;
	});
	return pdfjsPromise;
}

/**
 * Every text item of every page, joined.
 *
 * `hasEOL` becomes a real newline rather than a space, because
 * `normalizeExtracted`'s de-hyphenation step keys on `-\n` — without the newline
 * a line-broken "gravita-\ntion" would index as two tokens.
 */
function joinItems(items: unknown[]): string {
	let out = '';
	for (const raw of items) {
		const item = raw as PdfTextItem;
		if (typeof item.str !== 'string') continue;
		out += item.str;
		out += item.hasEOL ? '\n' : ' ';
	}
	return out;
}

/** Strips tags from an HTML document, for the `.htm`/`.html` half of the list. */
function extractHtml(source: string): string {
	// `DOMParser` rather than a regex, and 'text/html' rather than 'text/xml': the
	// parse is inert — no scripts run, no resources load — and it is the browser's
	// own tolerant parser, which is what these files were written for.
	const doc = new DOMParser().parseFromString(source, 'text/html');
	doc.querySelectorAll('script, style, noscript').forEach((el) => el.remove());
	return doc.body?.textContent ?? '';
}

async function extractPdf(file: File): Promise<{ raw: string; pages: number }> {
	const pdfjs = await loadPdfjs();
	// `isEvalSupported: false` because the app is served under a CSP-shaped
	// posture and pdf.js's font fast-path is not worth an eval; text extraction
	// does not use it.
	const doc = await pdfjs.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false })
		.promise;
	try {
		let raw = '';
		for (let n = 1; n <= doc.numPages; n++) {
			const page = await doc.getPage(n);
			raw += joinItems((await page.getTextContent()).items) + '\n';
			// Bail out early once the cap is comfortably exceeded. A 900-page scan of
			// a whole olympiad's archive should not hold the editor for a minute to
			// produce text that `capExtracted` will throw away anyway.
			if (raw.length > TEXT_CHAR_CAP * 2) break;
		}
		return { raw, pages: doc.numPages };
	} finally {
		// Releases the worker's copy of the document. Without it a contributor who
		// picks six files in a row leaks six parsed documents into the tab.
		await doc.destroy().catch(() => {});
	}
}

/**
 * Extracts one picked file to normalised plain text, in the browser.
 *
 * **Never throws.** Every failure — an unreadable PDF, a missing vendored build,
 * a browser too old for the dynamic import — comes back as `{status: 'error'}`,
 * because the caller's job is to *upload the file anyway* and let the row land
 * `pending` for the backfill sweep. An exception here must never be the reason an
 * upload does not happen.
 *
 * `empty` is not a failure either: it is what a scanned PDF looks like, and the
 * editor says so in as many words.
 */
export async function extractText(file: File): Promise<Extraction> {
	const ext = extensionOf(file.name);
	if (!isExtractable(ext)) return { status: 'skipped' };

	try {
		const { raw, pages } =
			ext === 'pdf' ? await extractPdf(file) : { raw: extractHtml(await file.text()), pages: 1 };

		const normalized = normalizeExtracted(raw);
		if (normalized.length < MIN_EXTRACTED_CHARS) return { status: 'empty', pages };

		const { text, truncated } = capExtracted(normalized);
		return { status: 'ok', text, chars: text.length, truncated, pages };
	} catch (e) {
		return { status: 'error', error: e instanceof Error ? e.message : 'Extraction failed' };
	}
}
