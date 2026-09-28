import { redirect } from '@sveltejs/kit';
import { CDN_BASE_URL } from '$lib/constants';
import { extensionOf } from '$lib/uploads';
import type { LayoutLoad } from './$types';

/** Olympiads once served at the site root (`/ipho/...`). Kept so old links still work. */
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
 * Redirects legacy URLs and passes the server layout's data through. Always
 * return `data`, or `user` drops out of every page's data.
 */
export const load: LayoutLoad = ({ url, data }) => {
	const firstSegment = url.pathname.split('/')[1];

	if (legacyOlympiadIds.includes(firstSegment)) {
		redirect(308, '/olympiads' + url.pathname);
	}

	if (firstSegment === 'contests') {
		redirect(308, url.pathname.replace('contests', 'olympiads'));
	}

	// `extensionOf`, not a fixed-width suffix: comparing the last four characters
	// silently skipped `.xlsx`, `.html` and `.docx`.
	if (fileExtensions.includes(extensionOf(url.pathname))) {
		redirect(308, CDN_BASE_URL + url.pathname);
	}

	return data;
};
