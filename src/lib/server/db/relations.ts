import { defineRelations } from 'drizzle-orm';
import * as schema from './schema';

/**
 * The relation graph, in Drizzle v1's Relational Queries v2 form.
 *
 * Lives in its own module rather than in `schema.ts` because `defineRelations`
 * takes the whole schema *namespace* — declaring it beside the tables it reads
 * would be a circular import.
 *
 * Declared but **deliberately not passed to `drizzle()`**, which is exactly the
 * status quo: the v0 `relations()` blocks this replaces were exported and never
 * handed to the client either, so `db.query` has always been empty and every
 * read in `queries/` goes through the core query builder.
 *
 * Nothing is broken by leaving it unwired. `auth.ts` already imports the
 * relations-v2 adapter (`@better-auth/drizzle-adapter/relations-v2`, which
 * `better-auth` does not re-export), and that adapter only reaches for
 * `db.query[model].findFirst(...)` when BetterAuth asks it to resolve a join
 * natively — which BetterAuth does only if `advanced.database.joins` is set.
 * It is not, so BetterAuth resolves every join itself with separate queries and
 * the RQBv2 path never runs. Choosing the v1 adapter instead would be equally
 * inert, for the same reason.
 *
 * Turning RQBv2 on is therefore a deliberate, multi-part change: pass
 * `{ relations }` to `drizzle()` in `hooks.server.ts`, parameterise `DB` in
 * `./index.ts` over this graph, set `advanced.database.joins`, and take the
 * auth-side relations from `bun run db:generate-auth` — BetterAuth emits those
 * as a `defineRelationsPart`, which must be spread *after* this full
 * `defineRelations`.
 */
export const relations = defineRelations(schema, (r) => ({
	user: {
		sessions: r.many.session({ from: r.user.id, to: r.session.userId }),
		accounts: r.many.account({ from: r.user.id, to: r.account.userId })
	},
	session: {
		// `optional: false` mirrors the NOT NULL on `session.user_id`: a session
		// row cannot exist without its user.
		user: r.one.user({ from: r.session.userId, to: r.user.id, optional: false })
	},
	account: {
		user: r.one.user({ from: r.account.userId, to: r.user.id, optional: false })
	}
}));
