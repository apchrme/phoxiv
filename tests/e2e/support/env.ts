import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * The e2e environment, read from `.env.test`, the same file `wrangler dev` gets
 * through `--env-file`. Every other module takes the port, origin and secret from
 * here, so `.env.test` stays the only place they are written. See docs/testing.md.
 */

/** The repository root, whatever directory a command was started from. */
export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** `.env.test`, relative to the repo root, as `wrangler dev --env-file` takes it. */
export const ENV_FILE = '.env.test';

/**
 * All the e2e server's state. Wiped and re-seeded on every server start. Inside
 * `.wrangler/`, which is gitignored, and never `.wrangler/state`, which holds the
 * developer's own local database.
 */
export const STATE_DIR = '.wrangler/e2e';

/**
 * Where `getPlatformProxy` must persist to reach the same data. `wrangler dev
 * --persist-to X` and `wrangler d1 ... --persist-to X` store under `X/v3`, but
 * `getPlatformProxy({ persist: { path } })` uses `path` as given.
 */
export const PROXY_PERSIST = `${STATE_DIR}/v3`;

/**
 * Parses `KEY=VALUE` lines, skipping blanks and `#` comment lines. Deliberately
 * no inline comments or quoting: wrangler's parser and this one must read the
 * file identically, so `.env.test` uses neither.
 */
function parseEnvFile(text: string): Record<string, string> {
	const vars: Record<string, string> = {};
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim();
		if (!line || line.startsWith('#')) continue;
		const eq = line.indexOf('=');
		if (eq < 1) throw new Error(`${ENV_FILE}: malformed line "${line}"`);
		vars[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
	}
	return vars;
}

/** The parsed `.env.test`. */
export const TEST_ENV = parseEnvFile(readFileSync(join(REPO_ROOT, ENV_FILE), 'utf8'));

function required(name: string): string {
	const value = TEST_ENV[name];
	if (!value) throw new Error(`${ENV_FILE} must set ${name}`);
	return value;
}

const authUrl = new URL(required('BETTER_AUTH_URL'));

// The suite signs session cookies and drives a real browser at this origin. A
// non-loopback host could mean a deployed site, so refuse before anything starts.
if (!['127.0.0.1', 'localhost', '[::1]'].includes(authUrl.hostname)) {
	throw new Error(
		`${ENV_FILE}: BETTER_AUTH_URL must be a loopback address, not ${authUrl.hostname}`
	);
}
if (!authUrl.port) throw new Error(`${ENV_FILE}: BETTER_AUTH_URL must name a port`);

/** The e2e server's origin, with no trailing slash: `http://127.0.0.1:8799`. */
export const BASE_URL = authUrl.origin;

/** The e2e server's host and port, for `wrangler dev --ip` / `--port`. */
export const HOST = authUrl.hostname;
export const PORT = Number(authUrl.port);

/** BetterAuth's signing secret, which the tests use to sign session cookies. */
export const SECRET = required('BETTER_AUTH_SECRET');

/** The email `isProtectedSuperadmin` protects. */
export const SUPERADMIN_EMAIL = required('SUPERADMIN_EMAIL');
