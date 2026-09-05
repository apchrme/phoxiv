import { capExtracted, MIN_EXTRACTED_CHARS, normalizeExtracted, TEXT_CHAR_CAP } from '$lib/search';
import { extensionOf, isExtractable } from '$lib/uploads';
// `import type` only — erased at compile time, so pdf.js stays out of BOTH
// bundles exactly as before, and the runtime string URL below is unchanged. It
// exists so `bun run check` sees the real API surface. This file used to
// hand-write its own structural types for pdf.js, and that is precisely how a
// call to `PDFDocumentProxy.destroy()` — a method pdf.js 6 removed — passed
// `svelte-check` while turning every successful extraction into
// `{status: 'error'}` in every browser. See {@link extractPdf}.
import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy, PDFWorker } from 'pdfjs-dist';

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

/**
 * The parser's own module type, not a hand-written approximation of it.
 *
 * `pdfjs-dist` is a devDependency at 6.3.289 — the same version the vendored
 * build in `static/vendor/pdfjs/` was copied from, and the README beside those
 * files is what keeps the two in step. Even so, these types are a **promise
 * about that build, not proof of it**: the module arrives through a runtime
 * string URL, so nothing on either side checks that the file on disk matches the
 * `.d.ts`. That is why {@link joinItems} still guards at runtime.
 */
type PdfjsModule = typeof import('pdfjs-dist');

/**
 * What `getTextContent()` hands back, derived rather than imported.
 *
 * `pdfjs-dist`'s entry point (`types/src/pdf.d.ts`) re-exports the page proxy but
 * **not** `TextItem`, so there is no such name to import — reaching for one does
 * not resolve. Going through the exported proxy reaches the same type by a route
 * that exists. The element is `TextItem | TextMarkedContent`, and only the former
 * has `str`.
 */
type TextContentItems = Awaited<ReturnType<PDFPageProxy['getTextContent']>>['items'];

/**
 * The result of one extraction attempt. There is no `throw` path — see
 * {@link extractText}.
 */
export type Extraction =
	| { status: 'ok'; text: string; chars: number; truncated: boolean; pages: number }
	| { status: 'empty'; pages: number }
	| { status: 'skipped' }
	| { status: 'error'; error: string };

/**
 * The parser and its worker, both cached for the life of the page.
 *
 * # Two caches, because the module alone is not enough
 *
 * `pdfjsPromise` caches the ES module. `getDocument` still starts a **fresh**
 * `Worker` for every call it is not handed one, so caching only the module left a
 * contributor who picks six files spinning up six workers, each fetching,
 * parsing and compiling pdf.js's 1.2 MB worker build. `sharedWorker` is the half
 * that makes "the worker is expensive to spin up" actually pay.
 *
 * # Why one worker survives many documents
 *
 * `PDFDocumentLoadingTask.destroy()` destroys only a worker it created itself: it
 * assigns `task._worker` in the branch that constructs one, and leaves it `null`
 * when `getDocument` was passed a `worker`, so the `this._worker?.destroy()` at
 * the end of `destroy()` is a no-op for ours. Measured against pdfjs-dist@6.3.289
 * with a 3-page archive PDF:
 *
 * ```
 * shared worker ready; destroyed = false
 * doc1 pages 3
 * after task1.destroy(); shared worker destroyed = false
 * doc2 pages 3 = reuse WORKS
 * ```
 *
 * So each extraction still destroys its own **task**, which is what releases that
 * document and its page cache, while the worker stays up for the next pick.
 */
let pdfjsPromise: Promise<PdfjsModule> | null = null;
let sharedWorker: PDFWorker | null = null;

function loadPdfjs(): Promise<PdfjsModule> {
	pdfjsPromise ??= import(/* @vite-ignore */ PDFJS_URL).then((mod) => {
		const pdfjs = mod as unknown as PdfjsModule;
		pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
		return pdfjs;
	});
	return pdfjsPromise;
}

/**
 * The shared worker, replacing it if the cached one has been destroyed.
 *
 * The `destroyed` check is not defensive padding: handed a dead worker,
 * `getDocument`'s setup rejects the loading task with `Worker was destroyed`, so
 * caching one blindly would let a single `destroy()` fail *every* remaining
 * extraction for the life of the page, with no way back short of a reload.
 * Verified against pdfjs-dist@6.3.289: destroying the shared worker by hand and
 * extracting again recovers, because this replaces it.
 *
 * Takes the already-resolved module rather than awaiting it, which is what
 * guarantees `GlobalWorkerOptions.workerSrc` is set before the worker is built.
 * `PDFWorker`'s constructor reads `workerSrc` *outside* its own try block, so
 * constructing one first throws synchronously rather than rejecting a promise
 * somebody downstream could catch.
 */
function sharedPdfWorker(pdfjs: PdfjsModule): PDFWorker {
	if (!sharedWorker || sharedWorker.destroyed) sharedWorker = new pdfjs.PDFWorker();
	return sharedWorker;
}

/**
 * Every text item of every page, joined.
 *
 * `hasEOL` becomes a real newline rather than a space, because
 * `normalizeExtracted`'s de-hyphenation step keys on `-\n` — without the newline
 * a line-broken "gravita-\ntion" would index as two tokens.
 *
 * The `'str' in item` test does two jobs at once. It narrows away
 * `TextMarkedContent`, which the array can hold and which has no `str`; and it is
 * the **runtime** guard behind the types above, which describe a build reached by
 * runtime URL and so only promise this shape rather than prove it.
 */
function joinItems(items: TextContentItems): string {
	let out = '';
	for (const item of items) {
		if (!('str' in item) || typeof item.str !== 'string') continue;
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
	// There used to be an `isEvalSupported: false` here, for the app's CSP-shaped
	// posture. **Do not put it back.** pdf.js 6 deleted both the option and the
	// thing it disabled: `isEvalSupported` appears 0 times in either vendored file
	// and 0 times in pdfjs-dist@6.3.289's types and build, and `new Function(`
	// appears 0 times in the worker build — the font fast-path it guarded is gone.
	// `getDocument` destructures named properties, so the key was silently ignored
	// rather than rejected, and the second the types below became real it showed up
	// as the dead letter it had been. Nothing about the CSP posture changed.
	//
	// `file.arrayBuffer()` has to stay inline here. pdf.js **detaches** the buffer
	// it is handed as `data`, so it is single-use: harmless today because every
	// pick reads the File afresh, but hoisting or caching that read would hand the
	// second extraction a zero-length buffer.
	const task: PDFDocumentLoadingTask = pdfjs.getDocument({
		data: await file.arrayBuffer(),
		worker: sharedPdfWorker(pdfjs)
	});
	try {
		const doc: PDFDocumentProxy = await task.promise;
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
		// The **task**, not the document, and two things about that:
		//
		// 1. pdf.js 6 removed `PDFDocumentProxy.destroy()` — cleanup moved to the
		//    loading task. The call that used to be here threw a *synchronous*
		//    `TypeError`, which the trailing `.catch()` could not touch because
		//    there was no promise to catch on. It escaped the `finally` and
		//    discarded the text the `try` had just finished computing, so every
		//    successful extraction surfaced as `{status: 'error'}`, in every
		//    browser, for every PDF.
		// 2. A throw in here therefore destroys a *result*, not just a resource.
		//    Leak the worker rather than lose the text.
		//
		// Safe on the failure path too: `_setupCapability` is resolved from a
		// `.finally()` on the setup chain, so `destroy()` still settles even when
		// `task.promise` rejected.
		try {
			await task.destroy();
		} catch {
			/* empty */
		}
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
		// Logged, not merely summarised. `{status: 'error'}` reaches the UI as one
		// friendly sentence, so for the whole life of the `doc.destroy()` bug above
		// the real `TypeError` — name, message and stack, pointing at the exact
		// line — existed only inside this catch, and was thrown away right here.
		// Keeping it in the console is what turns the next one into a one-minute
		// diagnosis; `error` below carries the message to the contributor as well.
		console.error('[pdf-text] extraction failed for', file.name, e);
		return { status: 'error', error: e instanceof Error ? e.message : 'Extraction failed' };
	}
}
