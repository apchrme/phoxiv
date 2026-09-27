/**
 * Renders the landing page's corpus thumbnails offline: `bun run thumbs:render`.
 * Never imported by application code. Lives under `src/` (not `scripts/`) so
 * `bun run check` type-checks it.
 *
 * For each {@link CORPUS} entry, fetches the PDF and writes
 * `src/lib/assets/thumbs/<slug>.png` (committed):
 * 1. Ghostscript renders page 1 at 150 dpi.
 * 2. ImageMagick flattens onto white, fills and crops from the top to 420×594 so
 *    all tiles match, strips metadata and reduces to 64 colours.
 * PNG compresses text pages well; enhanced-img converts to AVIF/WebP at build.
 *
 * Requires Ghostscript (`gswin64c` on Windows, `gs` elsewhere) and ImageMagick 7
 * on `PATH`.
 */

import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { CORPUS } from '../../routes/corpus.js';

const OUT_DIR = 'src/lib/assets/thumbs';

/** Tile dimensions. Must match the aspect ratio `CorpusTile.svelte` reserves. */
const WIDTH = 420;
const HEIGHT = 594;

/** On Windows only the console build, `gswin64c`, writes to stdout. */
const GS = process.platform === 'win32' ? 'gswin64c' : 'gs';

/**
 * Runs `cmd` with `input` on stdin and resolves with its stdout. Buffered, not
 * streamed, because both tools can exit 0 with no output; this catches that
 * instead of committing a blank tile.
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

		// Ignore EPIPE: a tool may close stdin early, which would otherwise crash.
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
			// PDF pages are transparent where blank; flatten onto white.
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

	// Some corpus files aren't PDFs (e.g. a .zip), and Ghostscript hangs on them.
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
