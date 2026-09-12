/**
 * Renders the landing page's corpus thumbnails, offline, from a maintainer's
 * machine.
 *
 * ```sh
 * bun run thumbs:render
 * ```
 *
 * **Never imported by application code**, exactly like `reindex-cli.ts` and
 * `auth-cli.ts` beside it — same `-cli` suffix, same rule, and the same reason
 * for living under `src/lib/server/` rather than a top-level `scripts/`:
 * `.svelte-kit/tsconfig.json`'s `include` covers `../src/**` but not a top-level
 * `scripts/`, so a script there would be linted by eslint yet invisible to
 * `bun run check`.
 *
 * # What it does
 *
 * For each entry in {@link CORPUS} it fetches the PDF from the CDN and pipes it
 * through two external tools, writing `src/lib/assets/thumbs/<slug>.png`:
 *
 * 1. **Ghostscript** rasterises page 1 at 150 dpi to a PNG on stdout.
 * 2. **ImageMagick** flattens it onto white, fits it to exactly 420×594, strips
 *    metadata and quantises to 64 colours.
 *
 * The output is committed. Nothing at request time — in the Worker or in the
 * browser — ever renders a PDF.
 *
 * # Why 420×594, cropped from the top
 *
 * The band's two rows sit on a single baseline each, so every tile must be the
 * same shape. `-resize 420x594^` fills the box rather than fitting inside it and
 * a north gravity crop takes the top: a portrait A4 maps to 420×594 essentially
 * exactly, and a landscape experiment sheet is cropped to its masthead instead
 * of being letterboxed into a tile of a different size.
 *
 * # Why PNG rather than JPEG
 *
 * A rendered page is flat-toned text, which palettes far better than it
 * photographs. At 420px wide, `-colors 64` measured 48 KB against JPEG's 74 KB
 * for the same page — and without the ringing that JPEG puts around glyph edges.
 * The committed PNGs are only sources: `@sveltejs/enhanced-img` re-encodes them
 * to AVIF/WebP with a `srcset` at build time, so what a visitor downloads is
 * smaller again.
 *
 * # Prerequisites
 *
 * Ghostscript and ImageMagick 7, both on `PATH`. Ghostscript's console binary is
 * named `gswin64c` on Windows and `gs` everywhere else — checking for `gs` alone
 * is why an earlier pass wrongly concluded it was not installed.
 */

import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { CORPUS } from '../../routes/corpus.js';

const OUT_DIR = 'src/lib/assets/thumbs';

/** Tile dimensions. Must match the aspect ratio `CorpusTile.svelte` reserves. */
const WIDTH = 420;
const HEIGHT = 594;

/**
 * Ghostscript's console executable. The Windows build ships `gswin64c` (console)
 * and `gswin64` (windowed); only the former writes usable bytes to stdout.
 */
const GS = process.platform === 'win32' ? 'gswin64c' : 'gs';

/**
 * Run `cmd`, feed it `input` on stdin, and resolve with everything it wrote to
 * stdout.
 *
 * stdout is collected rather than streamed straight into the next process: both
 * tools are happy to emit a truncated image *and* exit 0 when they dislike their
 * input, so holding the whole buffer is what lets a zero-length result be caught
 * here instead of being committed as a blank tile. A rendered page at 150 dpi is
 * a few megabytes, which is free on a maintainer's machine.
 */
function run(cmd: string, args: string[], input: Buffer): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
		const out: Buffer[] = [];
		const err: string[] = [];

		child.stdout.on('data', (c: Buffer) => out.push(c));
		child.stderr.on('data', (c: Buffer) => err.push(c.toString()));

		child.on('error', (e: NodeJS.ErrnoException) =>
			reject(
				new Error(
					e.code === 'ENOENT'
						? `${cmd} is not on PATH — install it and re-run (see the header of this file)`
						: `${cmd} failed to start: ${e.message}`
				)
			)
		);

		child.on('close', (code) => {
			if (code !== 0) return reject(new Error(`${cmd} exited ${code}\n${err.join('')}`));
			const buf = Buffer.concat(out);
			if (buf.length === 0) return reject(new Error(`${cmd} produced no output\n${err.join('')}`));
			resolve(buf);
		});

		// EPIPE is not an error here: a tool that has already decided it has read
		// enough closes stdin early, and the default handler would crash the script.
		child.stdin.on('error', () => {});
		child.stdin.end(input);
	});
}

async function render(slug: string, url: string): Promise<void> {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
	const pdf = Buffer.from(await res.arrayBuffer());

	const page = await run(
		GS,
		[
			'-q',
			'-dNOPAUSE',
			'-dBATCH',
			'-dSAFER',
			'-sDEVICE=png16m',
			'-r150',
			'-dFirstPage=1',
			'-dLastPage=1',
			'-sOutputFile=%stdout',
			'-'
		],
		pdf
	);

	const png = await run(
		'magick',
		[
			'png:-',
			// A PDF page is transparent where nothing was drawn. Compositing onto
			// white first is what stops a dark-theme tile showing white text on a
			// white page as an empty rectangle.
			'-background',
			'white',
			'-alpha',
			'remove',
			'-alpha',
			'off',
			'-resize',
			`${WIDTH}x${HEIGHT}^`,
			'-gravity',
			'north',
			'-crop',
			`${WIDTH}x${HEIGHT}+0+0`,
			'+repage',
			'-strip',
			'-colors',
			'64',
			'png:-'
		],
		page
	);

	await writeFile(`${OUT_DIR}/${slug}.png`, png);
	console.log(`  ${slug}.png  ${(png.length / 1024).toFixed(0)} KB`);
}

async function main() {
	await mkdir(OUT_DIR, { recursive: true });

	// `yearFiles` is not PDF-only — EuPhO 2021 carries an `Experimental Files`
	// `.zip`, and Ghostscript would sit on one of those rather than fail cleanly.
	const entries = CORPUS.filter((e) => e.url.toLowerCase().endsWith('.pdf'));
	const skipped = CORPUS.length - entries.length;

	console.log(`Rendering ${entries.length} thumbnails into ${OUT_DIR}/`);
	if (skipped > 0)
		console.log(`  (${skipped} non-PDF ${skipped === 1 ? 'entry' : 'entries'} skipped)`);

	let failed = 0;
	for (const { slug, url } of entries) {
		try {
			await render(slug, url);
		} catch (e) {
			failed++;
			console.error(`  ${slug}.png  FAILED — ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	if (failed > 0) {
		console.error(`\n${failed} of ${entries.length} failed.`);
		process.exit(1);
	}
	console.log(`\nDone — ${entries.length} thumbnails written.`);
}

await main();
