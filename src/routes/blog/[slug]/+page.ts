import type { PageLoad } from './$types';
import { error } from '@sveltejs/kit';
import type { Component } from 'svelte';

export interface PostMeta {
	title: string;
	date: string;
	description: string;
	tags?: string[];
	author?: string;
}

export const load: PageLoad = async ({ params }) => {
	const modules = import.meta.glob('/src/lib/posts/*.svx');
	const modulePath = `/src/lib/posts/${params.slug}.svx`;

	if (!(modulePath in modules)) {
		throw error(404, `Post "${params.slug}" not found`);
	}

	const mod = (await modules[modulePath]()) as {
		default: Component;
		metadata: Record<string, unknown>;
	};

	const metadata: PostMeta = {
		title: String(mod.metadata.title ?? 'Untitled'),
		date: String(mod.metadata.date ?? ''),
		description: String(mod.metadata.description ?? ''),
		tags: Array.isArray(mod.metadata.tags) ? (mod.metadata.tags as string[]) : [],
		author: mod.metadata.author ? String(mod.metadata.author) : undefined
	};

	return {
		content: mod.default,
		metadata
	};
};
