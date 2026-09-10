<script lang="ts">
	import type { ActivityEntry } from '$lib/types';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { formatDateTime } from '$lib/utils/date';
	import { actionLabel, actionVariant } from '$lib/activity';

	/**
	 * The contributor actions, newest first, a page at a time.
	 *
	 * Read-only. The load supplies the first page and "Load more" fetches the
	 * rest from `admin/activity` by keyset cursor, so history older than the
	 * newest page is reachable — it was not when the load simply capped the query.
	 */
	let {
		log,
		hasMore: hasMoreInitial
	}: {
		/** Page 1, from the load. */
		log: ActivityEntry[];
		/** Whether page 1 was a full page with more behind it. */
		hasMore: boolean;
	} = $props();

	/**
	 * The pages fetched past the first.
	 *
	 * **Deliberately not a copy of `log`.** Copying page 1 into `$state` would go
	 * stale the moment `banUser` or `setRole` runs its default `invalidateAll`
	 * and the load re-runs: the prop would update and the copy would not.
	 * Accumulating alongside it keeps the load authoritative over page 1.
	 *
	 * The concatenation is duplicate-free **by construction**, which matters
	 * because `{#each}` throws on a duplicate key: every `extra` id is strictly
	 * below the cursor it was fetched with, and a refreshed page 1 is the top
	 * `n` by id, so `min(page 1) ≥ old min > max(extra)`.
	 *
	 * The known cost: rows inserted between such a refresh and the accumulated
	 * tail leave an invisible gap until the page is reloaded. Acceptable for an
	 * audit view, and stated here so nobody has to discover it.
	 */
	let extra = $state.raw<ActivityEntry[]>([]);
	let hasMoreFetched = $state<boolean | null>(null);
	/**
	 * The button's own guard, and `$state` is right here: it is read from an
	 * `onclick` handler, not synchronously inside an `$effect`. The rule the
	 * search dialog records is narrower than "guards must be plain `let`" — it is
	 * that a guard read synchronously inside an `$effect` must not be `$state`
	 * the same path writes. Getting it wrong in *this* direction produces an
	 * invisible busy state, which is the failure mode this route is most likely
	 * to hide.
	 */
	let loadingMore = $state(false);
	let failed = $state(false);

	const rows = $derived([...log, ...extra]);
	const hasMore = $derived(hasMoreFetched ?? hasMoreInitial);

	async function loadMore() {
		// The cursor is the minimum of everything on screen, not of page 1.
		const cursor = rows.at(-1)?.id;
		if (loadingMore || cursor === undefined) return;
		loadingMore = true;
		failed = false;
		try {
			const res = await fetch(`/admin/activity?before=${cursor}`);
			// An error response with an HTML body would make `res.json()` throw as an
			// unhandled rejection; a 403 from an expired session is the live case.
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const page: { entries: ActivityEntry[]; hasMore: boolean } = await res.json();
			extra = [...extra, ...page.entries];
			hasMoreFetched = page.hasMore;
		} catch {
			failed = true;
		} finally {
			loadingMore = false;
		}
	}
</script>

<div class="overflow-hidden rounded-2xl border border-border bg-card ring-1 ring-foreground/5">
	<Table.Root>
		<Table.Header>
			<Table.Row class="hover:bg-transparent">
				<Table.Head>Time</Table.Head>
				<Table.Head>User</Table.Head>
				<Table.Head>Action</Table.Head>
				<Table.Head>Details</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each rows as entry (entry.id)}
				<Table.Row>
					<Table.Cell class="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
						{formatDateTime(entry.createdAt)}
					</Table.Cell>
					<Table.Cell class="font-medium">{entry.userName}</Table.Cell>
					<Table.Cell>
						<Badge variant={actionVariant(entry.action)} class="text-xs">
							{actionLabel(entry.action)}
						</Badge>
					</Table.Cell>
					<Table.Cell class="max-w-md text-muted-foreground">
						{entry.detail}
						{#if entry.olympiadId}
							<span class="ml-1 font-mono text-xs text-foreground">
								{entry.olympiadId}{entry.year ? `/${entry.year}` : ''}
							</span>
						{/if}
					</Table.Cell>
				</Table.Row>
			{/each}
			{#if rows.length === 0}
				<Table.Row>
					<Table.Cell colspan={4} class="py-12 text-center text-sm text-muted-foreground">
						No activity recorded yet.
					</Table.Cell>
				</Table.Row>
			{/if}
		</Table.Body>
	</Table.Root>
</div>

{#if hasMore}
	<div class="mt-4 flex flex-col items-center gap-2">
		<Button variant="outline" onclick={loadMore} disabled={loadingMore}>
			{#if loadingMore}<Spinner class="size-3.5" />{/if}
			Load more
		</Button>
		{#if failed}
			<p class="text-xs text-destructive">Could not load more entries.</p>
		{/if}
	</div>
{/if}
