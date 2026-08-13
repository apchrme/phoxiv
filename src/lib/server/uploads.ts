import { contentTypeFor, extensionOf, isAllowedExt, type UploadSpec } from '$lib/uploads';
import type { Validated } from './forms';

/**
 * Server-side enforcement of the upload rules declared in `$lib/uploads.ts`.
 *
 * The `accept` attribute on the form is a hint to the file picker and nothing
 * more — it is trivially bypassed. This is where the rules are actually applied.
 */

export type ValidatedUpload = {
	file: File;
	/** Lowercase extension, no dot. */
	ext: string;
	/** Derived from the extension, never from `file.type`. */
	contentType: string;
};

/**
 * Checks `file` against `spec`, returning the extension and the `Content-Type`
 * to store it under.
 *
 * The extension decides the `Content-Type`: `file.type` comes from the browser,
 * so an attacker could claim `image/png` for an HTML payload, which R2 would then
 * serve back with that type from our own CDN origin.
 *
 * @param subject sentence-initial noun for the size error, e.g. `'Icon file'`
 *   yields "Icon file too large (max 2 MB)".
 */
export function validateUpload(
	file: File | null,
	spec: UploadSpec,
	subject = 'File'
): Validated<ValidatedUpload> {
	if (!file) {
		return { ok: false, error: 'No file provided' };
	}

	if (file.size > spec.maxBytes) {
		return { ok: false, error: `${subject} too large (max ${spec.maxLabel})` };
	}

	const ext = extensionOf(file.name);
	if (!isAllowedExt(spec, ext)) {
		return { ok: false, error: `Unsupported file type. Use ${spec.label}.` };
	}

	return { ok: true, value: { file, ext, contentType: contentTypeFor(spec, ext) } };
}
