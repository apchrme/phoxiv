<script lang="ts">
	import { contests, type ContestTag } from '$lib/pregen/contests';
	import * as Card from './components/ui/card/index.ts';
	import Badge from './components/ui/badge/badge.svelte';
	import { Input } from './components/ui/input/index.js';
	import { cn } from '$lib/utils.js';

	const ALL_TAGS: ContestTag[] = ['International', 'Regional', 'National', 'Open'];

	let query = $state('');
	let activeTag = $state<ContestTag | null>(null);

	const filtered = $derived(() => {
		const q = query.trim().toLowerCase();
		return contests.filter((c) => {
			const matchesTag = activeTag === null || c.tag === activeTag;
			const matchesQuery =
				!q || c.name.toLowerCase().includes(q) || c.summary.toLowerCase().includes(q);
			return matchesTag && matchesQuery;
		});
	});
</script>

<!-- Search + filter toolbar -->
<div class="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center">
	<!-- shadcn Input with inset search icon -->
	<div class="relative flex-1">
		<svg
			class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			aria-hidden="true"
		>
			<circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
		</svg>
		<Input type="search" placeholder="Search contests…" bind:value={query} class="pl-9" />
	</div>

	<!-- Tag filter pills -->
	<div class="flex flex-wrap gap-2">
		<button
			onclick={() => (activeTag = null)}
			class={cn(
				'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
				activeTag === null
					? 'bg-primary text-primary-foreground'
					: 'border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
			)}
		>
			All
		</button>
		{#each ALL_TAGS as tag (tag)}
			<button
				onclick={() => (activeTag = activeTag === tag ? null : tag)}
				class={cn(
					'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
					activeTag === tag
						? 'bg-primary text-primary-foreground'
						: 'border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
				)}
			>
				{tag}
			</button>
		{/each}
	</div>
</div>

<!-- Contest grid -->
{#if filtered().length > 0}
	<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
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
	<div class="rounded-xl border border-dashed border-border py-12 text-center">
		<p class="mb-1 text-sm font-medium text-foreground text-center">No contests found</p>
		<p class="mb-0 text-xs text-muted-foreground text-center">
			Try a different search term or clear the filter.
		</p>
		<button
			onclick={() => {
				query = '';
				activeTag = null;
			}}
			class="mt-3 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
		>
			Clear filters
		</button>
	</div>
{/if}
