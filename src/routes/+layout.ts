import { redirect } from '@sveltejs/kit';

const olympiads = [
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
	if (olympiads.find((i) => i == url.pathname.split('/')[1])) {
		redirect(308, '/olympiads' + url.pathname);
	}

	if (url.pathname.split('/')[1] == 'contests') {
		redirect(308, url.pathname.replace('contests', 'olympiads'));
	}
}
