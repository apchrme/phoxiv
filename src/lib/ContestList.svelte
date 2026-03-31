<script lang="ts">
	import { contests, type ContestTag } from '$lib/pregen/contests';
	import * as Card from './components/ui/card/index.ts';
	import Badge from './components/ui/badge/badge.svelte';
	import type { BadgeVariant } from './components/ui/badge/badge.svelte';
	import { cn } from '$lib/utils.js';
</script>

<div class="grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2">
	{#each contests as contest (contest.id)}
		<a href="/contests/{contest.id}" class="group block no-underline!">
			<Card.Root
				class={cn(
					'h-full cursor-pointer py-4! transition-all duration-200',
					'hover:shadow-md hover:ring-2 hover:ring-primary/40'
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
							class="!py-0 !text-base !leading-snug !font-semibold text-card-foreground transition-colors duration-150 group-hover:text-primary"
						>
							{contest.name}
						</h3>
						<span class="!text-sm !leading-relaxed text-muted-foreground">
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
