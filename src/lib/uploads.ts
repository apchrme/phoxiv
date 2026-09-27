/*
 * What may be uploaded. Client-safe so the form's `accept` attribute and the
 * server check (`$lib/server/uploads.ts`) share one table. `slugifyLabel` and
 * `collidingLabel` are here so the editor's warning and the action agree.
 */

export type UploadSpec = {
	/** Permitted lowercase file extensions, without the leading dot. */
	readonly exts: readonly string[];
	/** Extension → `Content-Type` stored in R2. The browser's MIME type is never trusted. */
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
	/** Also list MIME types in `accept` (used for images). */
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
 * Extensions the browser extracts text from on upload. Other document types are
 * stored as `skipped`; `.docx`/`.xlsx` are extracted only by the backfill
 * script (`reindex-cli.ts`), and `.zip`/`.doc` never.
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
 * A file label reduced to a safe key segment. Never change this: existing R2
 * keys were built with it. See `$lib/server/storage.ts` and docs/data-model.md.
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
 * Compares slugs, not labels: `Solutions (official)` and `Solutions official`
 * share a key, and the DB's unique index on the raw label won't catch it. The
 * upload would silently replace the old file. Reject blank or punctuation-only
 * labels first, since empty slugs all match each other.
 */
export function collidingLabel(existing: readonly string[], candidate: string): string | null {
	const slug = slugifyLabel(candidate);
	return existing.find((label) => slugifyLabel(label) === slug) ?? null;
}

/** True when `icon` is an uploaded R2 URL rather than an emoji or flag code. */
export function isIconUrl(icon: string): boolean {
	return icon.startsWith('https://') || icon.startsWith('http://');
}
