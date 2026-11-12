import { defineParams } from '@sveltejs/kit/params';

/*
 * Route param matchers (`[name=matcher]`). A param that fails one doesn't match
 * the route at all, so the request 404s before any load or endpoint runs, and
 * an `/api/*` 404 never reaches `setSharedCache` (hooks.server.ts stores only a
 * 200 carrying that header).
 */
export const params = defineParams({
	/**
	 * A positive integer row id, as a number. Canonical digits only (no `+`, no
	 * leading zeros, no `1e3`), so `String(id)` gives back the param and
	 * `resolve()` builds the same path.
	 */
	id: (param) => (/^[1-9]\d{0,15}$/.test(param) ? Number(param) : undefined)
});
