import { contentTypeFor, extensionOf, isAllowedExt, type UploadSpec } from '$lib/uploads';
import type { Validated } from './forms';

/*
 * Server-side enforcement of the rules in `$lib/uploads.ts`. The form's `accept`
 * attribute is only a hint and is easily bypassed.
 */

export type ValidatedUpload = {
	file: File;
	/** Lowercase extension, no dot. */
	ext: string;
	/** Derived from the extension, never from `file.type`. */
	contentType: string;
};

/**
 * Checks `file` against `spec` and returns its extension and `Content-Type`.
 *
 * The type comes from the extension, never `file.type`, which the browser sets:
 * trusting it would let someone serve HTML from our CDN under a false type.
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
