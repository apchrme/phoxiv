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
	 * The full-text index, as reporting plus three maintenance buttons.
	 *
	 * **Deliberately read-only about the corpus itself.** There is no "index the
	 * next batch" button, because there is nothing for the Worker to loop over —
	 * extraction runs in the contributor's browser on upload and in
	 * `bun run index:backfill` on a maintainer's machine for everything older. That
	 * also sidesteps the infinite-submit-loop shape CLAUDE.md rule 8 records in
	 * this exact panel: the three actions below each do one bounded thing and
	 * return.
	 *
	 * **The counts are fetched here rather than handed down from the load.** They
	 * cost ~4,500 D1 rows — 93% of what opening `/admin` used to cost — and the
	 * panel opens on Users, so most visits never looked at them. `+page.svelte`
	 * only mounts this component once someone has actually opened the Index tab;
	 * see the latch there, which is what makes the deferral real.
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
	 * The breakdown, refetched after every maintenance action.
	 *
	 * `refresh()` rather than `loadOnce()` throughout, and `Resource`'s monotonic
	 * token is what makes that safe: a boolean in-flight guard would silently drop
	 * the post-prune refresh if the mount fetch were still running, leaving the
	 * counts permanently wrong — the exact failure the refresh exists to prevent.
	 * Its `loading` likewise stays false once there are numbers to show, so a
	 * maintenance click dims the card rather than flashing it back to a skeleton.
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
	 * Files in the archive that the index has never seen at all.
	 *
	 * An **approximation**: `indexed − known` clamped at zero, which an orphaned
	 * `file_text` row — one whose file has since been deleted and not yet pruned —
	 * hides by inflating `known`. The exact form is a `LEFT JOIN … WHERE id IS
	 * NULL` count at the same cost, so this is not a saving; it is just what the
	 * two numbers already on hand can answer. Left as it is, but do not read it as
	 * exact.
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
				The index is disposable: it is external-content FTS5, so a rebuild reconstructs it from the
				stored text with no re-extraction.
			</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-wrap gap-2">
			<!--
				`invalidateAll: false` on all three: the counts no longer come from the
				load, so the default would re-run the users and log queries to refresh
				nothing — and it would also reset the log's first page underneath the
				"Load more" accumulator. None of the three writes `user`, `olympiads`
				or `activity_log`. `onDone` fires after the response is in but before
				`update()`, so the write has committed and the refetch sees it.
			-->
			<form
				method="POST"
				action="?/ensureIndex"
				use:enhance={pending.track(() => 'ensureIndex', {
					invalidateAll: false,
					onDone: refresh
				})}
			>
				<SubmitButton {pending} key="ensureIndex" variant="outline" busyLabel="Rebuilding…">
					Rebuild index
				</SubmitButton>
			</form>
			<form
				method="POST"
				action="?/optimizeIndex"
				use:enhance={pending.track(() => 'optimizeIndex', {
					invalidateAll: false,
					onDone: refresh
				})}
			>
				<SubmitButton {pending} key="optimizeIndex" variant="outline" busyLabel="Merging…">
					Merge segments
				</SubmitButton>
			</form>
			<form
				method="POST"
				action="?/pruneIndex"
				use:enhance={pending.track(() => 'pruneIndex', {
					invalidateAll: false,
					onDone: refresh
				})}
			>
				<!-- Asks before submitting rather than during — see `ConfirmSubmit`.
				     `variant="outline"`, not destructive: it
				     removes index rows whose files are already gone, so it asks because it
				     cannot be undone, not because it destroys anything a reader can see. -->
				<ConfirmSubmit
					{pending}
					key="pruneIndex"
					variant="outline"
					title="Prune orphaned index rows?"
					description="Index rows for files that no longer exist are deleted. Nothing a reader can see changes, and rebuilding the index restores them."
					confirmLabel="Prune orphans"
				>
					Prune orphans
				</ConfirmSubmit>
			</form>
			<!--
				Not cosmetic. The panel fetches once on first open and then stays
				mounted, so without this an operator would watch a frozen card through
				a `bun run index:backfill` run — and docs/deployment.md names this tab
				as *the* way to tell a backfill landed.
			-->
			<Button variant="ghost" onclick={refresh} disabled={source.loading} class="ml-auto">
				{#if source.loading}
					<Spinner class="size-3.5" />
				{:else}
					<RefreshCw class="size-3.5" />
				{/if}
				Refresh
			</Button>
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
