<script lang="ts">
	import type { PageData } from './$types';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { formatDateTime } from '$lib/utils/date';
	import { actionLabel, actionVariant } from '$lib/activity';

	/**
	 * The most recent contributor actions, newest first.
	 *
	 * Read-only and unpaginated: the load caps the query, so the panel's title is
	 * the only place that number is stated.
	 */
	let { log }: { log: PageData['log'] } = $props();
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
			{#each log as entry (entry.id)}
				<Table.Row>
					<Table.Cell class="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
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
			{#if log.length === 0}
				<Table.Row>
					<Table.Cell colspan={4} class="py-12 text-center text-sm text-muted-foreground">
						No activity recorded yet.
					</Table.Cell>
				</Table.Row>
			{/if}
		</Table.Body>
	</Table.Root>
</div>
