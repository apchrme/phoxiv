import type { PageLoad } from './$types';
import { error } from '@sveltejs/kit';
import type { Component } from 'svelte';
import { toPostMeta } from '$lib/posts';

export const load: PageLoad = async ({ params }) => {
	// Lazy glob (no `eager`) so only the requested post's chunk is fetched.
	const modules = import.meta.glob('/src/lib/posts/*.svx');
	const modulePath = `/src/lib/posts/${params.slug}.svx`;

	if (!(modulePath in modules)) {
		error(404, `Post "${params.slug}" not found`);
	}

	const mod = (await modules[modulePath]()) as {
		default: Component;
		metadata: Record<string, unknown>;
	};

	return {
		content: mod.default,
		metadata: toPostMeta(mod.metadata, params.slug)
	};
};
