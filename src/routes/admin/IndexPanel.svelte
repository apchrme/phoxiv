<script lang="ts">
	import type { FileTextStats } from '$lib/types';
	import type { Pending } from '$lib/forms.svelte';
	import { onMount } from 'svelte';
	import { Resource } from '$lib/resource.svelte';
	import { plural } from '$lib/utils/plural';
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import SubmitButton from '$lib/components/forms/SubmitButton.svelte';
	import ConfirmSubmit from '$lib/components/forms/ConfirmSubmit.svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { RefreshCw } from '@lucide/svelte';

	/**
	 * The full-text index: status counts plus three maintenance actions.
	 *
	 * No "index the next batch" button: extraction runs in the browser on upload
	 * and in `bun run index:backfill`. Each action here does one bounded thing
	 * and returns; a self-resubmitting form in this panel once looped forever.
	 *
	 * The counts are expensive, so they are fetched here, not in the page load,
	 * and `+page.svelte` mounts this only once the Index tab is opened.
	 */
	let {
		pending
	}: {
		/** The page's single tracker, so the buttons can disable themselves. */
		pending: Pending;
	} = $props();

	/** Every status, in a fixed order, so a zero reads as a zero and not as absence. */
	const ORDER = ['ok', 'empty', 'skipped', 'pending', 'error'] as const;

	const DESCRIPTIONS: Record<string, string> = {
		ok: 'text extracted and searchable',
		empty: 'no text found — almost always a scanned PDF',
		skipped: 'file type that carries no extractable text',
		pending: 'queued; the next backfill run will pick these up',
		error: 'extraction failed; see the failures below'
	};

	/**
	 * The breakdown, refetched after every maintenance action. Uses `refresh()`,
	 * not `loadOnce()`, so a refresh requested while the first fetch is running
	 * isn't dropped. A refresh dims the card rather than showing the skeleton.
	 */
	const source = new Resource<FileTextStats>('/admin/index-stats');
	const refresh = () => void source.refresh();
	const stats = $derived(source.value);

	// Mounting is the trigger, because mounting is already gated on the tab.
	onMount(refresh);

	const byStatus = $derived(
		Object.fromEntries((stats?.counts ?? []).map((c) => [c.status, c.count])) as Record<
			string,
			number
		>
	);
	const known = $derived(ORDER.reduce((n, s) => n + (byStatus[s] ?? 0), 0));
	/**
	 * Files the index has never seen. Approximate: unpruned orphan rows inflate
	 * `known` and hide some unseen files.
	 */
	const unseen = $derived(stats ? Math.max(stats.indexed - known, 0) : 0);
</script>

<div class="flex flex-col gap-5">
	{#if source.failed && stats === null}
		<Card.Root>
			<Card.Header class="border-b">
				<Card.Title>Full-text index</Card.Title>
				<Card.Description>The index report could not be loaded.</Card.Description>
			</Card.Header>
			<Card.Content>
				<Button variant="outline" onclick={refresh} disabled={source.loading}>
					{#if source.loading}<Spinner class="size-3.5" />{/if}
					Retry
				</Button>
			</Card.Content>
		</Card.Root>
	{:else if stats === null}
		<Card.Root>
			<Card.Header class="border-b">
				<Card.Title>Full-text index</Card.Title>
				<Card.Description>Counting the archive…</Card.Description>
			</Card.Header>
			<Card.Content class="flex flex-col gap-3">
				{#each ORDER as status (status)}
					<Skeleton class="h-5 w-full max-w-md" />
				{/each}
			</Card.Content>
		</Card.Root>
	{:else}
		<Card.Root class={source.loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
			<Card.Header class="border-b">
				<Card.Title>Full-text index</Card.Title>
				<Card.Description>
					{stats.indexed} files in the archive. Extraction runs in the contributor's browser on upload;
					run <code>bun run index:backfill</code> for everything older.
				</Card.Description>
				<!-- The panel stays mounted, so this is how to watch a backfill progress. -->
				<Card.Action>
					<Button variant="ghost" size="sm" onclick={refresh} disabled={source.loading}>
						{#if source.loading}
							<Spinner class="size-3.5" />
						{:else}
							<RefreshCw class="size-3.5" />
						{/if}
						Refresh
					</Button>
				</Card.Action>
			</Card.Header>
			<Card.Content class="flex flex-col gap-3">
				<dl class="flex flex-col gap-2">
					{#each ORDER as status (status)}
						<div class="flex items-baseline gap-3">
							<dt class="w-24 shrink-0">
								<Badge variant={status === 'error' ? 'destructive' : 'secondary'}>{status}</Badge>
							</dt>
							<dd class="flex-1 text-sm">
								<span class="font-mono font-semibold">{byStatus[status] ?? 0}</span>
								<span class="ml-2 text-muted-foreground">{DESCRIPTIONS[status]}</span>
							</dd>
						</div>
					{/each}
					{#if unseen > 0}
						<div class="flex items-baseline gap-3">
							<dt class="w-24 shrink-0"><Badge variant="outline">unseen</Badge></dt>
							<dd class="flex-1 text-sm">
								<span class="font-mono font-semibold">{unseen}</span>
								<span class="ml-2 text-muted-foreground">
									never queued — uploaded before indexing existed, or loaded straight into R2
								</span>
							</dd>
						</div>
					{/if}
				</dl>
			</Card.Content>
		</Card.Root>
	{/if}

	<Card.Root>
		<Card.Header class="border-b">
			<Card.Title>Maintenance</Card.Title>
			<Card.Description>
				None of these is routine upkeep. None re-extracts text or touches the files themselves: the
				index is rebuilt from the text already stored.
			</Card.Description>
		</Card.Header>
		<!--
			`invalidateAll: false`: these actions change nothing the page load
			reads, and invalidating would reset the activity log's "Load more"
			pages. `onDone` runs after the write commits, so the refetch sees it.
		-->
		<Card.Content class="flex flex-col divide-y">
			<div class="flex flex-col gap-3 pb-4 sm:flex-row sm:items-center sm:justify-between">
				<div class="flex flex-col gap-1 text-sm">
					<p class="font-medium">Rebuild index</p>
					<p class="text-muted-foreground">
						Re-creates the search index and the triggers that keep it in sync, then refills it from
						the text already stored. Use it when full-text search returns nothing or errors, for
						example after a stray <code>db:push</code> dropped the index.
					</p>
				</div>
				<form
					method="POST"
					action="?/ensureIndex"
					class="shrink-0"
					use:enhance={pending.track(() => 'ensureIndex', {
						invalidateAll: false,
						onDone: refresh
					})}
				>
					<SubmitButton {pending} key="ensureIndex" variant="outline" busyLabel="Rebuilding…">
						Rebuild index
					</SubmitButton>
				</form>
			</div>
			<div class="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
				<div class="flex flex-col gap-1 text-sm">
					<p class="font-medium">Merge segments</p>
					<p class="text-muted-foreground">
						Compacts the index so searches read fewer pieces of it. Worth running after a large
						backfill. Each click does a bounded amount of work, so click again if a lot was added.
					</p>
				</div>
				<form
					method="POST"
					action="?/optimizeIndex"
					class="shrink-0"
					use:enhance={pending.track(() => 'optimizeIndex', {
						invalidateAll: false,
						onDone: refresh
					})}
				>
					<SubmitButton {pending} key="optimizeIndex" variant="outline" busyLabel="Merging…">
						Merge segments
					</SubmitButton>
				</form>
			</div>
			<div class="flex flex-col gap-3 pt-4 sm:flex-row sm:items-center sm:justify-between">
				<div class="flex flex-col gap-1 text-sm">
					<p class="font-medium">Prune orphans</p>
					<p class="text-muted-foreground">
						Deletes stored text for files that no longer exist. Those rows never show up in results,
						so this only reclaims database space and makes the "unseen" count above accurate. Cannot
						be undone.
					</p>
				</div>
				<form
					method="POST"
					action="?/pruneIndex"
					class="shrink-0"
					use:enhance={pending.track(() => 'pruneIndex', {
						invalidateAll: false,
						onDone: refresh
					})}
				>
					<!-- Confirms because it can't be undone, but `outline`, not destructive:
					     it only removes rows whose files are already gone. -->
					<ConfirmSubmit
						{pending}
						key="pruneIndex"
						variant="outline"
						title="Prune orphaned index rows?"
						description="Index rows for files that no longer exist are deleted. Nothing a reader can see changes: those rows could never appear in search results."
						confirmLabel="Prune orphans"
					>
						Prune orphans
					</ConfirmSubmit>
				</form>
			</div>
		</Card.Content>
	</Card.Root>

	{#if stats && stats.failures.length > 0}
		<Card.Root>
			<Card.Header class="border-b">
				<Card.Title>Failures</Card.Title>
				<Card.Description>
					Retried up to three times, then left alone so one bad file cannot block the queue.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<ul class="flex flex-col gap-2">
					{#each stats.failures as failure (failure.url)}
						<li class="flex flex-col gap-0.5 text-sm">
							<span class="font-mono break-all">{failure.url}</span>
							<span class="text-xs text-muted-foreground">
								{plural(failure.attempts, 'attempt')}
								{#if failure.error}— {failure.error}{/if}
							</span>
						</li>
					{/each}
				</ul>
			</Card.Content>
		</Card.Root>
	{/if}
</div>
