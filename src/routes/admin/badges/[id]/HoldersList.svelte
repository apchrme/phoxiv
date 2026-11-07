<script lang="ts">
	import UsersRoundIcon from '@lucide/svelte/icons/users-round';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import SearchBar from '#lib/components/search/SearchBar.svelte';
	import UserAvatar from '#lib/components/UserAvatar.svelte';
	import EmptyState from '#lib/components/EmptyState.svelte';
	import { formatDate } from '#lib/utils/date.js';
	import { plural } from '#lib/utils/plural.js';
	import type { PageData } from './$types';

	/**
	 * Who holds the badge, most recently earned first. Admin only: who holds a
	 * badge is never public (docs/auth.md), so this list exists nowhere outside
	 * `/admin`. It is the load's, so a save's recompute refreshes it.
	 *
	 * A badge anyone can earn may be held by most users, so the list filters by
	 * name or email and draws only the first {@link PAGE} matches until asked.
	 */
	let { holders }: { holders: PageData['holderList'] } = $props();

	const PAGE = 50;

	let query = $state('');
	let shown = $state(PAGE);

	const matches = $derived.by(() => {
		const q = query.trim().toLowerCase();
		if (!q) return holders;
		return holders.filter(
			(h) => h.name.toLowerCase().includes(q) || h.email.toLowerCase().includes(q)
		);
	});
</script>

<Card.Root id="holders">
	<Card.Header>
		<Card.Title>Holders</Card.Title>
		<Card.Description>
			{plural(holders.length, 'person holds', 'people hold')} this badge. Only admins can see who.
		</Card.Description>
	</Card.Header>
	<Card.Content class="flex flex-col gap-3">
		{#if holders.length === 0}
			<EmptyState
				icon={UsersRoundIcon}
				message="Nobody holds it yet"
				hint="It's awarded as soon as someone's progress qualifies."
			/>
		{:else}
			{#if holders.length > 10}
				<SearchBar
					placeholder="Filter by name or email…"
					bind:value={() => query, (v) => ((query = v), (shown = PAGE))}
				/>
			{/if}

			{#if matches.length === 0}
				<p class="m-0 text-sm text-muted-foreground">No holder matches "{query.trim()}".</p>
			{:else}
				<ul
					aria-label="Holders"
					class="m-0 flex list-none flex-col divide-y divide-border overflow-hidden rounded-xl border border-border p-0"
				>
					{#each matches.slice(0, shown) as holder (holder.id)}
						<li
							data-testid="badge-holder"
							class={['flex items-center gap-3 px-3 py-2', holder.banned && 'opacity-50']}
						>
							<UserAvatar user={holder} class="size-8 ring-2 ring-border" iconClass="size-3.5" />
							<div class="flex min-w-0 flex-1 flex-col">
								<span class="flex items-center gap-1.5">
									<span class="truncate text-sm font-medium">{holder.name}</span>
									{#if holder.banned}
										<Badge variant="destructive" class="text-xs">Banned</Badge>
									{/if}
								</span>
								<span class="truncate text-xs text-muted-foreground">{holder.email}</span>
							</div>
							<span class="shrink-0 text-xs whitespace-nowrap text-muted-foreground tabular-nums">
								{formatDate(holder.earnedAt, 'short')}
							</span>
						</li>
					{/each}
				</ul>
				{#if matches.length > shown}
					<Button variant="outline" size="sm" class="self-start" onclick={() => (shown += PAGE)}>
						Show {Math.min(PAGE, matches.length - shown)} more of {matches.length - shown}
					</Button>
				{/if}
			{/if}
		{/if}
	</Card.Content>
</Card.Root>
