import type { PageLoad } from './$types';
import { loadPostList } from '$lib/posts';

export const load: PageLoad = async () => {
	return { posts: loadPostList(import.meta.glob('/src/lib/posts/*.svx', { eager: true })) };
};
