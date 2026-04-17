import type { PageLoad } from './$types';

export interface PostMeta {
	slug: string;
	title: string;
	date: string;
	description: string;
	tags?: string[];
	author?: string;
}

export const load: PageLoad = async () => {
	const modules = import.meta.glob('/src/lib/posts/*.svx', { eager: true });

	const posts: PostMeta[] = Object.entries(modules)
		.map(([path, mod]) => {
			const slug = path.split('/').pop()?.replace('.svx', '') ?? '';
			const { metadata } = mod as { metadata: Record<string, unknown> };
			return {
				slug,
				title: String(metadata.title ?? 'Untitled'),
				date: String(metadata.date ?? ''),
				description: String(metadata.description ?? ''),
				tags: Array.isArray(metadata.tags) ? (metadata.tags as string[]) : [],
				author: metadata.author ? String(metadata.author) : undefined
			};
		})
		.filter((p) => p.date)
		.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

	return { posts };
};
