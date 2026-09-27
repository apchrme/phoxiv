import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

/**
 * Sanitiser for olympiad descriptions. The output is stored in
 * `olympiads.descriptionHtml` and rendered with `{@html}`, so keep this the only
 * allow-list; a second copy could drift into an XSS hole.
 *
 * sanitize-html defaults plus `img`, `target`/`rel` on links, and `class`
 * everywhere. `script`, `style`, `iframe` and `on*` handlers stay excluded.
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
