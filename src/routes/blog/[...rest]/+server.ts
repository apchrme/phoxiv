/* The blog was folded into /about. Old links to /blog and its posts land there. */

import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// A literal path, like the legacy redirects in src/routes/+layout.ts: `resolve()`
// gives a relative `./about` in an endpoint.
export const GET: RequestHandler = () => redirect(308, '/about');
