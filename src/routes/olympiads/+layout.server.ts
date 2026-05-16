export const load = ({ setHeaders }) => {
	// setHeaders({
	// max-age=0: prevents local cache from being used, so purge cache in cloudflare will update everyone's cache
	// s-maxage=86400: shared cache only updates at most once a day
	// stale-while-revalidate=604800: the shared cache will serve stale data after a day of "freshness", but force revalidation in the background. This ensures that no one will have to deal with a cache miss (unless no one views the site for a week)
	// 'cache-control': 'max-age=0, s-maxage=86400, stale-while-revalidate=604800'
	// });
};
