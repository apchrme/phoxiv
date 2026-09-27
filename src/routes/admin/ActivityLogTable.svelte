<script lang="ts">
	import type { ActivityEntry } from '$lib/types';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { ScrollText } from '@lucide/svelte';
	import { formatDateTime } from '$lib/utils/date';
	import { actionLabel, actionVariant } from '$lib/activity';

	/**
	 * Contributor actions, newest first. The load supplies page 1; "Load more"
	 * fetches older pages from `admin/activity` by id cursor.
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
	 * Pages after the first. Don't copy `log` into state: it would go stale when
	 * an action reloads the page. Ids in `extra` are always below page 1's, so
	 * the concatenation has no duplicate keys. After a reload, entries between
	 * page 1 and `extra` may be missing until a full refresh; accepted.
	 */
	let extra = $state.raw<ActivityEntry[]>([]);
	let hasMoreFetched = $state<boolean | null>(null);
	/** `$state` is fine here: it's read in a click handler, not inside an `$effect`. */
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
			// Check first: an HTML error body (e.g. a 403 after the session expires)
			// would make `res.json()` throw.
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
					<!-- `boxed={false}`: the table already has edges. -->
					<Table.Cell colspan={4} class="py-12">
						<EmptyState
							boxed={false}
							icon={ScrollText}
							message="No activity recorded yet"
							hint="Edits made through the contribute pages show up here."
						/>
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
