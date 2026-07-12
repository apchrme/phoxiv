export const load = ({ setHeaders }) => {
	setHeaders({
		'cache-control': 'max-age=14400, must-revalidate, private'
	});
};
export const ssr = false; // prevent flash of content from SSR before animations