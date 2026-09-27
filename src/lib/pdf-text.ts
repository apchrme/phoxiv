import { capExtracted, MIN_EXTRACTED_CHARS, normalizeExtracted, TEXT_CHAR_CAP } from '$lib/search';
import { extensionOf, isExtractable } from '$lib/uploads';
// Type-only, so pdf.js stays out of both bundles. It lets `bun run check` see
// the real API; hand-written types once hid a call to a method pdf.js 6 removed.
import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy, PDFWorker } from 'pdfjs-dist';

/**
 * Text extraction in the contributor's browser. Browser-only: nothing under
 * `$lib/server/` may import it.
 *
 * Not in the Worker because pdf.js is about as large as the whole server bundle,
 * and every route would pay its cold-start cost for a path that runs a few times
 * a month. Extracting on file-pick also lets the editor flag a scanned PDF while
 * the contributor can still swap it.
 *
 * See docs/search.md.
 */

/**
 * A runtime string URL, imported with `@vite-ignore`. Don't let Vite resolve it:
 * a resolved dynamic import is also emitted into the server build, which would
 * put pdf.js in the Worker.
 *
 * The files are static assets in `static/vendor/pdfjs/`; the README there pins
 * the version.
 */
const PDFJS_URL = '/vendor/pdfjs/pdf.min.mjs';
const PDFJS_WORKER_URL = '/vendor/pdfjs/pdf.worker.min.mjs';

/**
 * The parser's module type, from the `pdfjs-dist` devDependency. It must match
 * the vendored build, but nothing checks that at runtime, hence the guard in
 * {@link joinItems}.
 */
type PdfjsModule = typeof import('pdfjs-dist');

/**
 * What `getTextContent()` returns. `pdfjs-dist` doesn't export `TextItem`, so
 * it's derived from the page proxy. Items are `TextItem | TextMarkedContent`;
 * only the former has `str`.
 */
type TextContentItems = Awaited<ReturnType<PDFPageProxy['getTextContent']>>['items'];

/** The result of one extraction attempt. {@link extractText} never throws. */
export type Extraction =
	| { status: 'ok'; text: string; chars: number; truncated: boolean; pages: number }
	| { status: 'empty'; pages: number }
	| { status: 'skipped' }
	| { status: 'error'; error: string };

/**
 * The parser module and one shared worker, cached for the life of the page.
 *
 * Without `sharedWorker`, `getDocument` starts a fresh worker per file. Passing
 * our own worker is safe across documents: `task.destroy()` only destroys a
 * worker the task created itself. Each extraction still destroys its task, which
 * frees the document.
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
 * The shared worker, replaced if it has been destroyed. Otherwise one dead
 * worker would fail every later extraction until a reload.
 *
 * Takes the resolved module so `workerSrc` is already set; the `PDFWorker`
 * constructor throws synchronously without it.
 */
function sharedPdfWorker(pdfjs: PdfjsModule): PDFWorker {
	if (!sharedWorker || sharedWorker.destroyed) sharedWorker = new pdfjs.PDFWorker();
	return sharedWorker;
}

/**
 * Every text item of every page, joined.
 *
 * `hasEOL` becomes a real newline because `normalizeExtracted`'s de-hyphenation
 * keys on `-\n`. The `'str' in item` test skips `TextMarkedContent` and is also
 * the runtime check behind the types above.
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
	// DOMParser with 'text/html' is inert (no scripts run, nothing loads) and
	// tolerant of messy HTML.
	const doc = new DOMParser().parseFromString(source, 'text/html');
	doc.querySelectorAll('script, style, noscript').forEach((el) => el.remove());
	return doc.body?.textContent ?? '';
}

async function extractPdf(file: File): Promise<{ raw: string; pages: number }> {
	const pdfjs = await loadPdfjs();
	// Don't add `isEvalSupported: false`: pdf.js 6 removed the option, and
	// `getDocument` silently ignores unknown keys.
	//
	// Keep `file.arrayBuffer()` inline. pdf.js detaches the buffer it is given,
	// so a cached or reused buffer would be empty the second time.
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
			// Stop once well past the cap; `capExtracted` would discard the rest.
			if (raw.length > TEXT_CHAR_CAP * 2) break;
		}
		return { raw, pages: doc.numPages };
	} finally {
		// Destroy the task, not the document: pdf.js 6 removed
		// `PDFDocumentProxy.destroy()`, and calling it threw here, discarding
		// every successful result. A throw in this block loses the text, so
		// swallow it and leak the worker instead. `destroy()` also settles when
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
 * Never throws. Every failure returns `{status: 'error'}`, because the caller
 * must upload the file anyway and let the backfill retry it. `empty` is not a
 * failure; it is what a scanned PDF looks like.
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
		// Log the real error: the UI only shows a friendly message, and without
		// this the stack is lost.
		console.error('[pdf-text] extraction failed for', file.name, e);
		return { status: 'error', error: e instanceof Error ? e.message : 'Extraction failed' };
	}
}
