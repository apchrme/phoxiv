import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

/**
 * Markdown rendering for olympiad descriptions.
 *
 * The output is stored in `olympiads.descriptionHtml` and later interpolated
 * with `{@html}` on the public olympiad page, so **this is the only place the
 * sanitiser runs**. Two copies of the allow-list would eventually diverge, and a
 * divergence here is an XSS hole rather than a cosmetic bug.
 *
 * The allow-list is sanitize-html's defaults plus:
 * - `img`, so descriptions can embed logos and diagrams;
 * - `target`/`rel` on links, so external links can open in a new tab;
 * - `class` on any element, so descriptions can use the app's utility classes.
 *
 * Notably still excluded: `script`, `style`, `iframe`, and every `on*` handler.
 */
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
	allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img']),
	allowedAttributes: {
		...sanitizeHtml.defaults.allowedAttributes,
		a: ['href', 'target', 'rel'],
		'*': ['class']
	}
};

/** Renders trusted-author Markdown to sanitised HTML. */
export async function renderMarkdown(md: string): Promise<string> {
	return sanitizeHtml(await marked.parse(md), SANITIZE_OPTIONS);
}

/** {@link renderMarkdown}, passing `null` through for nullable columns. */
export async function renderMarkdownOrNull(md: string | null): Promise<string | null> {
	return md ? renderMarkdown(md) : null;
}
