<script lang="ts">
	import type { PageData } from './$types';
	import type { Pending } from '$lib/forms.svelte';
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';

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
	 */
	let {
		fileText,
		pending
	}: {
		fileText: PageData['fileText'];
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

	const byStatus = $derived(
		Object.fromEntries(fileText.counts.map((c) => [c.status, c.count])) as Record<string, number>
	);
	const known = $derived(ORDER.reduce((n, s) => n + (byStatus[s] ?? 0), 0));
	/** Files in the archive that the index has never seen at all. */
	const unseen = $derived(Math.max(fileText.indexed - known, 0));
</script>

<div class="flex flex-col gap-5">
	<Card.Root>
		<Card.Header class="border-b">
			<Card.Title>Full-text index</Card.Title>
			<Card.Description>
				{fileText.indexed} files in the archive. Extraction runs in the contributor's browser on upload;
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

	<Card.Root>
		<Card.Header class="border-b">
			<Card.Title>Maintenance</Card.Title>
			<Card.Description>
				The index is disposable: it is external-content FTS5, so a rebuild reconstructs it from the
				stored text with no re-extraction.
			</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-wrap gap-2">
			<form method="POST" action="?/ensureIndex" use:enhance={pending.track(() => 'ensureIndex')}>
				<Button type="submit" variant="outline" disabled={pending.has('ensureIndex')}>
					{#if pending.has('ensureIndex')}<Spinner class="size-3.5" />{/if}
					Rebuild index
				</Button>
			</form>
			<form
				method="POST"
				action="?/optimizeIndex"
				use:enhance={pending.track(() => 'optimizeIndex')}
			>
				<Button type="submit" variant="outline" disabled={pending.has('optimizeIndex')}>
					{#if pending.has('optimizeIndex')}<Spinner class="size-3.5" />{/if}
					Merge segments
				</Button>
			</form>
			<form
				method="POST"
				action="?/pruneIndex"
				use:enhance={pending.track(() => 'pruneIndex', {
					confirm: 'Remove index rows for files that no longer exist?'
				})}
			>
				<Button type="submit" variant="outline" disabled={pending.has('pruneIndex')}>
					{#if pending.has('pruneIndex')}<Spinner class="size-3.5" />{/if}
					Prune orphans
				</Button>
			</form>
		</Card.Content>
	</Card.Root>

	{#if fileText.failures.length > 0}
		<Card.Root>
			<Card.Header class="border-b">
				<Card.Title>Failures</Card.Title>
				<Card.Description>
					Retried up to three times, then left alone so one bad file cannot block the queue.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<ul class="flex flex-col gap-2">
					{#each fileText.failures as failure (failure.url)}
						<li class="flex flex-col gap-0.5 text-sm">
							<span class="font-mono break-all">{failure.url}</span>
							<span class="text-xs text-muted-foreground">
								{failure.attempts} attempt{failure.attempts === 1 ? '' : 's'}
								{#if failure.error}— {failure.error}{/if}
							</span>
						</li>
					{/each}
				</ul>
			</Card.Content>
		</Card.Root>
	{/if}
</div>
