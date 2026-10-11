import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getPlatformProxy } from 'wrangler';
import { ENV_FILE, PROXY_PERSIST, REPO_ROOT, STATE_DIR } from './env';

/*
 * The only way the e2e harness runs wrangler, as a child process or in-process.
 * Every call is forced local, pointed at the e2e state and given `.env.test`, so
 * nothing the suite does can reach the production database, the bucket, or the
 * free-tier quotas. See docs/testing.md, "The safety guards".
 */

const WRANGLER_BIN = join(REPO_ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

/** Arguments that would point wrangler at Cloudflare instead of local state. */
const REMOTE_FLAGS = ['--remote', '-r', '--experimental-remote', '--x-remote-bindings'];

/**
 * Variables removed from this process and every child:
 * - `CLOUDFLARE_*` / `CF_*`: an API token would let a slip reach the real account.
 *   `CLOUDFLARE_INCLUDE_PROCESS_ENV` would also leak this process's env into the
 *   Worker, and `CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=false` would drop `.env.test`.
 * - `BETTER_AUTH_*`, `GITHUB_*`: the developer's real secrets, which Bun autoloads
 *   from `.env`. The Worker must see only `.env.test`.
 * - `NODE_ENV`, `TEST`: either one set to `test` makes BetterAuth skip its origin
 *   check (`isTest()` in better-auth's create-context), so the suite would pass
 *   against a server that is laxer than production.
 */
const STRIPPED_PREFIXES = ['CLOUDFLARE_', 'CF_', 'BETTER_AUTH_', 'GITHUB_'];
const STRIPPED_NAMES = ['NODE_ENV', 'TEST'];

/** Keys of the developer's `.env`, which Bun autoloads into `process.env`. */
function devEnvKeys(): string[] {
	const path = join(REPO_ROOT, '.env');
	if (!existsSync(path)) return [];
	return readFileSync(path, 'utf8')
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line && !line.startsWith('#') && line.includes('='))
		.map((line) => line.slice(0, line.indexOf('=')).trim());
}

/** `process.env` without anything that could reach Cloudflare or weaken the server. */
export function cleanEnv(): NodeJS.ProcessEnv {
	const dropped = new Set([...STRIPPED_NAMES, ...devEnvKeys()]);
	const env: Record<string, string | undefined> = {};
	for (const [key, value] of Object.entries(process.env)) {
		const upper = key.toUpperCase();
		if (dropped.has(key) || STRIPPED_PREFIXES.some((p) => upper.startsWith(p))) continue;
		env[key] = value;
	}
	env.WRANGLER_SEND_METRICS = 'false';
	// Miniflare otherwise downloads https://workers.cloudflare.com/cf.json for
	// `request.cf` whenever its cached copy is missing or a month old, which is
	// every CI run. No spec reads `request.cf`; the built-in placeholder will do.
	env.CLOUDFLARE_CF_FETCH_ENABLED = 'false';
	// `cf-typegen` declares the Worker's variables on `ProcessEnv` as required, which
	// describes the Worker, not this process.
	return env as NodeJS.ProcessEnv;
}

/**
 * Replaces this process's own environment with {@link cleanEnv}. For the code
 * that runs wrangler in-process (`localPlatformProxy`) and for everything this
 * process spawns. Call it first thing in an entry point.
 */
export function scrubProcessEnv(): void {
	const clean = cleanEnv();
	for (const key of Object.keys(process.env)) if (!(key in clean)) delete process.env[key];
	Object.assign(process.env, clean);
}

/** Throws if `args` could make wrangler talk to Cloudflare. */
function assertLocal(args: readonly string[]): void {
	const remote = args.find((a) => REMOTE_FLAGS.includes(a) || a.startsWith('--remote='));
	if (remote) throw new Error(`The e2e harness never runs wrangler with ${remote}`);
}

/**
 * Starts `wrangler <args>` under Node with `--local --persist-to .wrangler/e2e`
 * and `--env-file .env.test`, a clean environment and no stdin (so no prompt can
 * hang the run).
 *
 * `--env-file` matters for every command, not only `dev`: without it wrangler
 * loads the developer's `.env` and `.env.local` into its own environment on
 * startup, whatever this process removed.
 */
export function spawnWranglerLocal(
	args: readonly string[],
	options: { stdio?: 'inherit' | 'pipe' } = {}
): ChildProcess {
	assertLocal(args);
	const forced = ['--local', '--persist-to', STATE_DIR, '--env-file', ENV_FILE];
	// Under Node, not Bun: wrangler supports only Node.
	return spawn('node', [WRANGLER_BIN, ...args, ...forced], {
		cwd: REPO_ROOT,
		env: cleanEnv(),
		stdio: ['ignore', options.stdio ?? 'inherit', options.stdio ?? 'inherit']
	});
}

/**
 * Stops `child` and everything it started. On Windows, `child.kill()` ends only
 * wrangler's launcher: the real CLI and its `workerd.exe` live on, keep the port,
 * and hold `.wrangler/e2e` open so the next run can't wipe it.
 */
export function killTree(child: ChildProcess): void {
	if (child.pid === undefined || child.exitCode !== null) return;
	if (process.platform === 'win32') {
		spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
	} else {
		child.kill('SIGTERM');
	}
}

/** Runs a one-shot wrangler command locally and resolves when it exits 0. */
export function wranglerLocal(args: readonly string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawnWranglerLocal(args);
		child.on('error', reject);
		child.on('exit', (code) =>
			code === 0 ? resolve() : reject(new Error(`wrangler ${args.join(' ')} exited ${code}`))
		);
	});
}

/**
 * The e2e bindings, in-process, for the seed. `remoteBindings: false` is what
 * keeps this local: if `wrangler.jsonc` ever marks a binding `remote`, the seed
 * would otherwise be written to production with the developer's credentials.
 * `envFiles` keeps it off the developer's `.env`. `getPlatformProxy` persists to
 * its path as given, so it gets `PROXY_PERSIST` (`.wrangler/e2e/v3`), the
 * directory `--persist-to .wrangler/e2e` uses.
 */
export function localPlatformProxy<Env>() {
	return getPlatformProxy<Env>({
		configPath: join(REPO_ROOT, 'wrangler.jsonc'),
		envFiles: [ENV_FILE],
		persist: { path: join(REPO_ROOT, PROXY_PERSIST) },
		remoteBindings: false
	});
}
