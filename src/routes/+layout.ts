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

const fileExtensions = [
	'pdf', 'xlsx', 'zip', 'htm', 'html', 'doc', 'docx'
]

export function load({ url }) {
	// redirect legacy urls
	if (olympiads.find((i) => i == url.pathname.split('/')[1])) {
		redirect(308, '/olympiads' + url.pathname);
	}

	if (url.pathname.split('/')[1] == 'contests') {
		redirect(308, url.pathname.replace('contests', 'olympiads'));
	}

	if (fileExtensions.find((i) => i == url.pathname.slice(-3))) {
		redirect(308, 'https://cdn.phoxiv.org'+ url.pathname);
	}
}
