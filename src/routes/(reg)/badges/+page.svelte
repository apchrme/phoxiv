<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import SvelteSeo from 'svelte-seo';
	import AwardIcon from '@lucide/svelte/icons/award';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import SearchXIcon from '@lucide/svelte/icons/search-x';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import EmptyState from '#lib/components/EmptyState.svelte';
	import BadgeMedal from '#lib/components/BadgeMedal.svelte';
	import BadgeRequirement from '#lib/components/BadgeRequirement.svelte';
	import BadgeStanding from '#lib/components/BadgeStanding.svelte';
	import SearchBar from '#lib/components/search/SearchBar.svelte';
	import BadgeStatusFilter, { type BadgeStatus } from './BadgeStatusFilter.svelte';
	import Skeleton from '#lib/components/ui/skeleton/skeleton.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Resource } from '#lib/resource.svelte.js';
	import { plural } from '#lib/utils/plural.js';
	import { mergeStanding, type BadgeProgressMap, type PublicBadge } from '#lib/badges.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	/**
	 * The catalogue and holder counts, from the shared-cached `/api/badges`, so a
	 * visit costs no D1 read. It comes most holders first; the page keeps that
	 * order. The viewer's own standing comes separately from the
	 * uncached `/progress/badges`: this page is in `(reg)` and cached for four
	 * hours, so it must not carry per-user data itself.
	 */
	const catalogue = new Resource<PublicBadge[]>('/api/badges');
	const mine = new Resource<BadgeProgressMap>('/progress/badges');

	// Captured at mount, not tracked: a sign-in or sign-out reloads the page.
	onMount(() => {
		void catalogue.loadOnce();
		if (data.user) void mine.loadOnce();
	});

	let query = $state('');
	let status = $state<BadgeStatus>('all');

	/**
	 * The badges the search and filter leave, each with the viewer's standing.
	 * The text match covers only what the card shows, so a hidden requirement is
	 * searchable only by a holder, who sees it anyway.
	 */
	const visible = $derived.by(() => {
		const needle = query.trim().toLowerCase();
		return (catalogue.value ?? [])
			.map((badge) => {
				const standing = mine.value?.[badge.id];
				return { badge, hasStanding: !!standing, ...mergeStanding(badge, standing) };
			})
			.filter(
				({ badge, earned, summary }) =>
					(status === 'all' || (status === 'earned') === earned) &&
					(needle === '' ||
						[badge.name, badge.description, summary].some((text) =>
							text?.toLowerCase().includes(needle)
						))
			);
	});
</script>

<SvelteSeo
	title="Badges — phoXiv"
	description="Badges you can earn on phoXiv by completing problems."
/>

<PageHeader
	title="Badges"
	description="Earned by completing problems. Click on any badge to view its details. Some are hidden :)"
/>

<section class="pb-16">
	<div class="mb-6">
		<SearchBar placeholder="Search badges…" bind:value={query}>
			{#snippet trailing()}
				{#if data.user}
					<BadgeStatusFilter bind:value={status} disabled={!mine.value} />
				{/if}
			{/snippet}
		</SearchBar>
	</div>

	{#if catalogue.loading}
		<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
			{#each { length: 4 }, i (i)}
				<Skeleton class="h-28 w-full" />
			{/each}
		</div>
	{:else if catalogue.failed}
		<EmptyState
			variant="error"
			icon={TriangleAlertIcon}
			message="Couldn't load the badges"
			hint="Something went wrong fetching the list. Reloading usually fixes it."
		>
			{#snippet action()}
				<Button variant="outline" size="sm" onclick={() => location.reload()}>Reload</Button>
			{/snippet}
		</EmptyState>
	{:else if !catalogue.value?.length}
		<EmptyState icon={AwardIcon} message="No badges yet" hint="Check back soon." />
	{:else if visible.length > 0}
		<ul aria-label="Badges" class="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2">
			{#each visible as { badge, hasStanding, earned, earnedAt, summary, count, requiredCount, holders } (badge.id)}
				<!-- The whole card opens the badge's page: the heading's link stretches
				     over it (`after:inset-0`), so there is one link per card, not a
				     link wrapping a list of facts. -->
				<li
					data-testid="badge-card"
					class="group relative flex gap-4 rounded-xl border border-border bg-card p-4 text-card-foreground transition-colors focus-within:ring-2 focus-within:ring-ring hover:bg-muted/40"
				>
					<!-- Muted only once we know the viewer hasn't earned it. -->
					<BadgeMedal icon={badge.icon} color={badge.color} earned={!hasStanding || earned} />
					<div class="flex min-w-0 flex-1 flex-col gap-1">
						<div class="flex items-baseline justify-between gap-2">
							<h2 class="m-0 truncate text-base font-semibold">
								<a
									href={resolve(`badges/${badge.id}`)}
									class="outline-none after:absolute after:inset-0 after:rounded-xl"
								>
									{badge.name}
								</a>
							</h2>
							<span class="shrink-0 text-xs text-muted-foreground tabular-nums">
								Earned by {plural(holders, 'person', 'people')}
							</span>
						</div>
						<div class="flex flex-row justify-between gap-1">
							<div class="flex grow flex-col items-baseline justify-between gap-1">
								{#if badge.description}
									<p class="m-0 text-sm text-foreground/80">{badge.description}</p>
								{/if}
								<BadgeRequirement {summary} />
								<BadgeStanding name={badge.name} {earnedAt} {count} {requiredCount} class="mt-1" />
							</div>

							<!-- Says the card opens something; the admin menu's cards use the same. -->
							<ChevronRightIcon
								class="size-4 shrink-0 self-center text-muted-foreground transition-transform group-hover:translate-x-0.5"
								aria-hidden="true"
							/>
						</div>
					</div>
				</li>
			{/each}
		</ul>
	{:else}
		<EmptyState
			icon={SearchXIcon}
			message="No badges found"
			hint={data.user
				? 'Try a different search term, or clear the filter.'
				: 'Try a different search term.'}
		>
			{#snippet action()}
				<Button
					variant="outline"
					size="sm"
					onclick={() => {
						query = '';
						status = 'all';
					}}
				>
					Clear filters
				</Button>
			{/snippet}
		</EmptyState>
	{/if}
</section>
