import { rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { seed } from './fixtures/seed';
import { REPO_ROOT, STATE_DIR } from './support/env';
import { localPlatformProxy, scrubProcessEnv, wranglerLocal } from './support/wrangler';

/*
 * Gives the e2e server an empty, migrated and seeded database: wipe
 * `.wrangler/e2e`, apply every migration, insert `fixtures/seed-data.ts`.
 * `server.ts` runs this before every start. See docs/testing.md.
 */

/**
 * Refuses to delete anything but `.wrangler/e2e` itself. An exact match, not a
 * "somewhere inside `.wrangler/`" rule: paths on Windows compare without case,
 * so `.wrangler/State` is the developer's own `.wrangler/state`, and `relative()`
 * returns an absolute path for another drive.
 */
function assertDisposable(dir: string): void {
	const allowed = join(REPO_ROOT, '.wrangler', 'e2e');
	if (dir.toLowerCase() !== allowed.toLowerCase()) {
		throw new Error(`Refusing to delete ${dir}: the e2e state must be ${allowed}`);
	}
}

function wipe(dir: string): void {
	assertDisposable(dir);
	try {
		rmSync(dir, { recursive: true, force: true });
	} catch (err) {
		const code = (err as NodeJS.ErrnoException).code;
		if (code === 'EBUSY' || code === 'EPERM') {
			throw new Error(
				`Couldn't delete ${STATE_DIR}: a workerd process from an earlier run still holds it. ` +
					`Stop it (Windows: \`taskkill /IM workerd.exe /F\`; elsewhere: \`pkill workerd\`) ` +
					`and run the tests again.`,
				{ cause: err }
			);
		}
		throw err;
	}
}

export async function prepare(): Promise<void> {
	scrubProcessEnv();
	wipe(resolve(REPO_ROOT, STATE_DIR));

	// The migrations, not `db:push`: they create the hand-written FTS5 table and
	// its triggers, which `db:push` would offer to drop (CLAUDE.md rule 1).
	await wranglerLocal(['d1', 'migrations', 'apply', 'DB']);

	// R2 is never written here: under the proxy a streamed `put()` fails
	// (workers-sdk#4373), and no spec needs a seeded object, since the browser
	// never loads one from the CDN.
	const proxy = await localPlatformProxy<{ DB: D1Database }>();
	try {
		await seed(proxy.env.DB);
	} finally {
		await proxy.dispose();
	}
}

if (import.meta.main) await prepare();
