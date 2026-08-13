/**
 * The single source of truth for what may be uploaded.
 *
 * Deliberately client-safe (not under `$lib/server/`) so the `accept` attribute
 * a form advertises and the allow-list the action enforces are derived from the
 * same table and cannot drift apart. The server-side validator that consumes
 * these specs lives in `$lib/server/uploads.ts`.
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

/** True when `icon` is an uploaded R2 URL rather than an emoji or flag code. */
export function isIconUrl(icon: string): boolean {
	return icon.startsWith('https://') || icon.startsWith('http://');
}
