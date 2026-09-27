import { defineRelations } from 'drizzle-orm';
import * as schema from './schema';

/**
 * Drizzle relations (RQB v2). In its own module because `defineRelations` takes
 * the whole schema namespace, which would be a circular import in `schema.ts`.
 *
 * Not passed to `drizzle()`, so `db.query` is empty and all reads use the core
 * query builder. That's fine: BetterAuth only uses relational queries when
 * `advanced.database.joins` is set, and it isn't.
 *
 * To enable RQB v2: pass `{ relations }` to `drizzle()` in `hooks.server.ts`,
 * type `DB` in `./index.ts` over it, set `advanced.database.joins`, and spread
 * the auth relations from `bun run db:generate-auth` after this one.
 */
export const relations = defineRelations(schema, (r) => ({
	user: {
		sessions: r.many.session({ from: r.user.id, to: r.session.userId }),
		accounts: r.many.account({ from: r.user.id, to: r.account.userId })
	},
	session: {
		// `optional: false` matches the NOT NULL on `session.user_id`.
		user: r.one.user({ from: r.session.userId, to: r.user.id, optional: false })
	},
	account: {
		user: r.one.user({ from: r.account.userId, to: r.user.id, optional: false })
	}
}));
