/**
 * The single source of truth for what may be uploaded.
 *
 * Deliberately client-safe (not under `$lib/server/`) so the `accept` attribute
 * a form advertises and the allow-list the action enforces are derived from the
 * same table and cannot drift apart. The server-side validator that consumes
 * these specs lives in `$lib/server/uploads.ts`.
 *
 * `slugifyLabel` and `collidingLabel` live here for the same reason: the file
 * editor warns about a colliding label before the upload and the action refuses
 * it after, and the two must agree on what "colliding" means.
 */

export type UploadSpec = {
	/** Permitted lowercase file extensions, without the leading dot. */
	readonly exts: readonly string[];
	/**
	 * Extension → `Content-Type` written to R2. The extension is authoritative:
	 * the MIME type the browser reports is attacker-controlled and never trusted.
	 */
	readonly mimeByExt: Readonly<Record<string, string>>;
	readonly maxBytes: number;
	/** Ready for an `<input type="file" accept={...}>` attribute. */
	readonly accept: string;
	/** Human-readable extension list, for UI copy and error messages. */
	readonly label: string;
	/** Rendered size limit, e.g. "2 MB". */
	readonly maxLabel: string;
};

const MB = 1024 * 1024;

function spec(
	mimeByExt: Record<string, string>,
	maxBytes: number,
	label: string,
	maxLabel: string,
	/** Some pickers also list MIME types; images do, documents historically don't. */
	includeMimeInAccept = false
): UploadSpec {
	const exts = Object.keys(mimeByExt);
	const extPart = exts.map((e) => `.${e}`);
	const mimePart = includeMimeInAccept ? [...new Set(Object.values(mimeByExt))] : [];
	return {
		exts,
		mimeByExt,
		maxBytes,
		accept: [...extPart, ...mimePart].join(','),
		label,
		maxLabel
	};
}

/** Olympiad icons. Small by design — they render at 40px. */
export const ICON_UPLOAD = spec(
	{
		svg: 'image/svg+xml',
		png: 'image/png',
		jpg: 'image/jpeg',
		jpeg: 'image/jpeg',
		webp: 'image/webp',
		avif: 'image/avif'
	},
	2 * MB,
	'SVG, PNG, JPG, WebP, or AVIF',
	'2 MB',
	true
);

/** Problem papers, solutions, marking schemes and answer sheets. */
export const DOCUMENT_UPLOAD = spec(
	{
		pdf: 'application/pdf',
		xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		zip: 'application/zip',
		doc: 'application/msword',
		docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		htm: 'text/html',
		html: 'text/html'
	},
	50 * MB,
	'PDF, XLSX, ZIP, DOC, DOCX, or HTML',
	'50 MB'
);

/** The problem-titles CSV consumed by the `importTitles` action. */
export const CSV_UPLOAD = spec({ csv: 'text/csv' }, 1 * MB, 'CSV', '1 MB');

/**
 * The document extensions the **browser** can extract text from, beside the
 * `DOCUMENT_UPLOAD` spec so the year editor and the server read one table —
 * exactly as `slugifyLabel` is shared.
 *
 * PDF is the overwhelming majority of the corpus; `.htm`/`.html` come along free
 * as a two-line `DOMParser` tag-strip in the same module. Everything else in
 * `DOCUMENT_UPLOAD` is stored `skipped`:
 *
 * - `.zip` and legacy `.doc` are not extractable at all, and stay that way.
 * - `.docx`/`.xlsx` **are** zips of XML, so the local backfill script can read
 *   them with a devDependency at zero shipping cost. They are a script feature,
 *   not a Worker one, which is why they are absent from this list and present in
 *   `reindex-cli.ts`'s own.
 */
export const EXTRACTABLE_EXTS = ['pdf', 'htm', 'html'] as const;

/** True when the browser extractor will attempt `ext`. */
export function isExtractable(ext: string): boolean {
	return (EXTRACTABLE_EXTS as readonly string[]).includes(ext);
}

/** Lowercase extension of `fileName`, without the dot; `''` if it has none. */
export function extensionOf(fileName: string): string {
	const parts = fileName.split('.');
	return parts.length > 1 ? (parts.pop()?.toLowerCase() ?? '') : '';
}

/** True when `ext` is permitted by `spec`. */
export function isAllowedExt(spec: UploadSpec, ext: string): boolean {
	return Object.hasOwn(spec.mimeByExt, ext);
}

/** The `Content-Type` to store `ext` under, falling back to a safe generic. */
export function contentTypeFor(spec: UploadSpec, ext: string): string {
	return spec.mimeByExt[ext] ?? 'application/octet-stream';
}

/**
 * A file label reduced to a safe key segment.
 *
 * Must stay byte-identical to what produced the keys already in the bucket —
 * a change here means existing objects can no longer be located. See
 * `$lib/server/storage.ts` for the key layout it feeds, and `docs/data-model.md`.
 */
export function slugifyLabel(label: string): string {
	return label
		.toLowerCase()
		.replace(/\s+/g, '_')
		.replace(/[^a-z0-9_]/g, '');
}

/**
 * The existing label whose R2 key `candidate` would overwrite, or `null`.
 *
 * Compared on the *slug*, not on the labels themselves. The slug is what becomes
 * the key's filename and it is lossy — case, punctuation and repeated whitespace
 * all vanish — so `Solutions (official)` and `Solutions official` are two
 * different labels naming one object. The database cannot catch that: its unique
 * index is on the raw label. R2's `put` would then replace the earlier file in
 * place without complaint, leaving both rows pointing at a single object that
 * either row's delete can remove, and the survivor linked to a 404.
 *
 * Blank and punctuation-only candidates are the caller's problem: reject them
 * before asking, or an empty slug will match every other empty slug.
 */
export function collidingLabel(existing: readonly string[], candidate: string): string | null {
	const slug = slugifyLabel(candidate);
	return existing.find((label) => slugifyLabel(label) === slug) ?? null;
}

/** True when `icon` is an uploaded R2 URL rather than an emoji or flag code. */
export function isIconUrl(icon: string): boolean {
	return icon.startsWith('https://') || icon.startsWith('http://');
}
