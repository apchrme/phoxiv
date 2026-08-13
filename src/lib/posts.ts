/**
 * Blog post loading.
 *
 * Posts are `.svx` files in `$lib/posts/`, compiled by mdsvex and discovered
 * with `import.meta.glob`. Their frontmatter is untyped, so every field is
 * coerced here rather than at each call site.
 */

export interface PostMeta {
	slug: string;
	title: string;
	date: string;
	description: string;
	tags: string[];
	author?: string;
}

/** Coerces one post's untyped frontmatter into a `PostMeta`. */
export function toPostMeta(metadata: Record<string, unknown>, slug: string): PostMeta {
	return {
		slug,
		title: String(metadata.title ?? 'Untitled'),
		date: String(metadata.date ?? ''),
		description: String(metadata.description ?? ''),
		tags: Array.isArray(metadata.tags) ? metadata.tags.map(String) : [],
		author: metadata.author ? String(metadata.author) : undefined
	};
}

/**
 * All posts, newest first. Posts without a `date` are dropped: they are drafts,
 * and there would be no sensible place to sort them.
 *
 * Takes the glob result as a parameter because `import.meta.glob` is rewritten
 * at build time and only resolves relative to the file it is written in.
 */
export function loadPostList(modules: Record<string, unknown>): PostMeta[] {
	return Object.entries(modules)
		.map(([path, mod]) => {
			const slug = path.split('/').pop()?.replace('.svx', '') ?? '';
			const { metadata } = mod as { metadata: Record<string, unknown> };
			return toPostMeta(metadata, slug);
		})
		.filter((p) => p.date)
		.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}
