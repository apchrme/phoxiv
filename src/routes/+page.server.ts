export const load = ({ setHeaders }) => {
	setHeaders({
		'cache-control': 'max-age=14400, must-revalidate, private'
	});
}