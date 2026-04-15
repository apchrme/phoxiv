import { error } from '@sveltejs/kit';
import contests from '$lib/pregen/output/contests.json';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params }) => {
	if (!contests.find((i) => i.id == params.contest)) {
		error(404, {
			message: 'Not found'
		});
	}
};
