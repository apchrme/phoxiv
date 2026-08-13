import { redirect } from '@sveltejs/kit';
import { CDN_BASE_URL } from '$lib/constants';
import type { LayoutLoad } from './$types';

/**
 * Olympiad ids that used to live at the site root (`/ipho/...`) before the
 * `/olympiads` prefix was introduced. Kept so old links and search-engine
 * results keep working.
 */
const legacyOlympiadIds = [
	'apho',
	'eotvos',
	'eupho',
	'inpho',
	'ipho',
	'sjpo',
	'spho',
	'spot',
	'usapho',
	'usatst'
];

/** Extensions that used to be served from `/static` and now live on the CDN. */
const fileExtensions = ['pdf', 'xlsx', 'zip', 'htm', 'html', 'doc', 'docx'];

/**
 * Redirects legacy URLs, and passes the server layout's data through.
 *
 * The pass-through is not optional: when a universal `+layout.ts` exists,
 * SvelteKit derives `LayoutData` from *this* function's return type, so
 * returning nothing would drop `user` from every page's `data` type.
 */
export const load: LayoutLoad = ({ url, data }) => {
	if (legacyOlympiadIds.find((i) => i == url.pathname.split('/')[1])) {
		redirect(308, '/olympiads' + url.pathname);
	}

	if (url.pathname.split('/')[1] == 'contests') {
		redirect(308, url.pathname.replace('contests', 'olympiads'));
	}

	if (fileExtensions.find((i) => '.' + i == url.pathname.slice(-4))) {
		redirect(308, CDN_BASE_URL + url.pathname);
	}

	return data;
};
