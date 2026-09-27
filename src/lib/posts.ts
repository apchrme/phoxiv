/* Blog posts: mdsvex `.svx` files in `$lib/posts/`, found with `import.meta.glob`. */

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
 * All posts, newest first. Posts without a `date` are drafts and are dropped.
 * Takes the glob result because `import.meta.glob` resolves relative to its caller.
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
