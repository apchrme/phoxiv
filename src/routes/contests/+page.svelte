<script lang="ts">
	import contests from '$lib/pregen/output/contests.json';
	import type { ContestTag } from '$lib/pregen/types.js';
	import * as Card from '$lib/components/ui/card/index';
	import { Badge } from '$lib/components/ui/badge/index';
	import * as ToggleGroup from '$lib/components/ui/toggle-group/index.js';
	import SearchBar from '$lib/components/SearchBar.svelte';
	import SearchEmptyState from '$lib/components/SearchEmptyState.svelte';
	import { cn } from '$lib/utils.js';

	// this seems redundant. I should remove this
	const ALL_TAGS: ContestTag[] = ['International', 'Regional', 'National', 'Open'];

	let query = $state('');
	let activeTag = $state<ContestTag | null>(null);

	const filtered = $derived(() => {
		const q = query.trim().toLowerCase();
		return contests.filter((c) => {
			const matchesTag = activeTag === null || c.tag === activeTag;
			const matchesQuery =
				!q ||
				c.name.toLowerCase().includes(q) ||
				c.summary.toLowerCase().includes(q) ||
				c.id.toLowerCase().includes(q);
			return matchesTag && matchesQuery;
		});
	});
</script>

<section id="contests" class="mb-4">
	<div class="my-5 md:my-10">
		<h1>
			Contests
		</h1>
		<p class="m-0 text-muted-foreground">
			Click any card to explore problems, solutions &amp; marking schemes.
		</p>
	</div>

	<!-- Search + filter toolbar -->
	<div class="mb-5">
		<SearchBar placeholder="Search contests…" bind:value={query}>
			{#snippet filters()}
				<ToggleGroup.Root
					type="single"
					value={activeTag ?? ''}
					onValueChange={(v) => (activeTag = (v as ContestTag) || null)}
					class="flex-wrap justify-center sm:flex-nowrap"
				>
					<ToggleGroup.Item value="">All</ToggleGroup.Item>
					{#each ALL_TAGS as tag (tag)}
						<ToggleGroup.Item value={tag}>{tag}</ToggleGroup.Item>
					{/each}
				</ToggleGroup.Root>
			{/snippet}
		</SearchBar>
	</div>

	<!-- Contest grid -->
	{#if filtered().length > 0}
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-4">
			{#each filtered() as contest (contest.id)}
				<a href="/contests/{contest.id}" class="group block">
					<Card.Root
						class={cn(
							'h-full cursor-pointer py-4! transition-all duration-200',
							'ring-border hover:shadow-md hover:ring-2 hover:ring-primary/40'
						)}
					>
						<Card.Content class="flex h-full flex-col gap-3 px-5">
							<!-- Top row: emoji + badge -->
							<div class="flex items-start justify-between">
								<span class="text-4xl leading-none">{contest.icon}</span>
								<Badge variant="outline">{contest.tag}</Badge>
							</div>

							<!-- Body -->
							<div class="flex flex-1 flex-col gap-1">
								<h3
									class="py-0 text-base leading-snug font-semibold text-card-foreground transition-colors duration-150 group-hover:text-primary"
								>
									{contest.name}
								</h3>
								<span class="text-sm leading-relaxed text-muted-foreground">
									{contest.summary}
								</span>
							</div>

							<!-- Footer arrow -->
							<div
								class="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-all duration-150 group-hover:gap-2 group-hover:text-primary"
							>
								View archive
								<svg
									class="size-3 transition-transform duration-150 group-hover:translate-x-0.5"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2.5"
									aria-hidden="true"
								>
									<path d="M5 12h14M12 5l7 7-7 7" />
								</svg>
							</div>
						</Card.Content>
					</Card.Root>
				</a>
			{/each}
		</div>
	{:else}
		<SearchEmptyState
			message="No contests found"
			hint="Try a different search term or clear the filter."
			clearLabel="Clear filters"
			onClear={() => {
				query = '';
				activeTag = null;
			}}
		/>
	{/if}
</section>

<!-- Contribute CTA -->
<section class="">
	<div
		class="flex flex-col items-start justify-between gap-4 rounded-2xl bg-primary px-6 py-5 sm:flex-row sm:items-center"
	>
		<p class="mb-0 text-sm font-medium text-primary-foreground/90">
			Want to add problems or help maintain the site? Open a PR or reach out.
		</p>
		<a
			href="mailto:admin@phoxiv.org"
			class="shrink-0 rounded-lg bg-primary-foreground px-4 py-2 text-sm font-semibold text-primary transition-opacity hover:opacity-90"
		>
			Get in touch →
		</a>
	</div>
</section>
