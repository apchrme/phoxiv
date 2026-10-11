import { spawn, type ChildProcess } from 'node:child_process';
import { prepare } from './prepare';
import { HOST, PORT, REPO_ROOT } from './support/env';
import { cleanEnv, killTree, scrubProcessEnv, spawnWranglerLocal } from './support/wrangler';

/*
 * The Playwright `webServer` command (`bun tests/e2e/server.ts`), also runnable on
 * its own as `bun run test:e2e:server`:
 *
 *   1. build the app, unless E2E_SKIP_BUILD is set;
 *   2. wipe, migrate and seed `.wrangler/e2e` (prepare.ts);
 *   3. serve the build with `wrangler dev`, on local state only.
 *
 * `wrangler dev`, not `vite dev`: it runs the deployed bundle in real workerd,
 * with the real `caches.default` that `/api/*` depends on, SvelteKit's CSRF
 * check (which `vite dev` skips) and working R2 uploads (which fail under
 * `vite dev`, workers-sdk#4373). See docs/testing.md, "The e2e server".
 */

// First: Bun has autoloaded the developer's `.env` into this process.
scrubProcessEnv();

function run(command: string, args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const child: ChildProcess = spawn(command, args, {
			cwd: REPO_ROOT,
			env: cleanEnv(),
			stdio: ['ignore', 'inherit', 'inherit']
		});
		child.on('error', reject);
		child.on('exit', (code) =>
			code === 0 ? resolve() : reject(new Error(`${command} ${args.join(' ')} exited ${code}`))
		);
	});
}

if (process.env.E2E_SKIP_BUILD) {
	// stderr, because Playwright shows a web server's stderr but drops its stdout.
	// A PowerShell `$env:E2E_SKIP_BUILD` outlives the command, so say it every time.
	console.error('[e2e] E2E_SKIP_BUILD is set: serving the existing .svelte-kit/cloudflare build');
} else {
	await run(process.execPath, ['run', 'build']);
}

await prepare();

const server = spawnWranglerLocal([
	'dev',
	'--ip',
	HOST,
	'--port',
	String(PORT),
	// wrangler.jsonc's `route` is `phoxiv.org`, so by default wrangler rewrites each
	// request's URL, `Origin` and `Referer` to http://phoxiv.org. BetterAuth then
	// sees an untrusted origin and answers every cookie-bearing POST with 403
	// "Invalid origin" (sign-out included). Pointing the upstream back at the e2e
	// server keeps the real origin.
	'--local-upstream',
	`${HOST}:${PORT}`,
	'--show-interactive-dev-session=false'
]);

// Playwright kills this process's whole tree. Run on its own and interrupted,
// take wrangler and its workerd with it.
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
	process.on(signal, () => {
		killTree(server);
		process.exit(0);
	});
}
server.on('exit', (code) => process.exit(code ?? 0));
