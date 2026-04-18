import { error } from '@sveltejs/kit';
import olympiads from '$lib/pregen/output/olympiads.json';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params }) => {
	if (!olympiads.find((i) => i.id == params.olympiad)) {
		error(404, {
			message: 'Not found'
		});
	}
};
