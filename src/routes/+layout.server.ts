import { redirect } from '@sveltejs/kit';

const contests = [
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

export function load({ url }) {
	// redirect legacy urls
	if (contests.find((i) => i == url.pathname.split('/')[1])) {
		redirect(308, '/contests' + url.pathname);
	}
}
