<script lang="ts">
	import uFuzzy from '@leeoniya/ufuzzy';
	import files from '$lib/pregen/files.json';
	import contests from '$lib/pregen/contests.json';
	import type { YearEntry, ProblemEntry } from '$lib/pregen/types.js';
	import type { FileTypeLabel } from '$lib/pregen/types.js';
	import SearchIcon from '@lucide/svelte/icons/search';
	import XIcon from '@lucide/svelte/icons/x';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import Badge from '$lib/components/ui/badge/badge.svelte';
	import { cn } from '$lib/utils.js';
	import { goto } from '$app/navigation';
	import { fade, scale } from 'svelte/transition';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	// ---------------------------------------------------------------------------
	// Search index — built once at module load time
	// ---------------------------------------------------------------------------

	type SearchItem = {
		contestId: string;
		contestName: string;
		contestIcon: string;
		year: number;
		problem: ProblemEntry;
		probFTEntries: [string, FileTypeLabel][];
		/** Pre-lowercased concatenation of all searchable fields. */
		searchText: string;
	};

	const index: SearchItem[] = [];
	for (const contest of contests) {
		const years = (files as unknown as Record<string, YearEntry[]>)[contest.id] ?? [];
		const probFTEntries = Object.entries(contest.problemFileTypes);
		for (const yearEntry of years) {
			for (const problem of yearEntry.problems) {
				index.push({
					contestId: contest.id,
					contestName: contest.name,
					contestIcon: contest.icon,
					year: yearEntry.year,
					problem,
					probFTEntries,
					searchText: [
						String(yearEntry.year),
						problem.number,
						problem.title ?? '',
						contest.name,
						contest.id,
					]
						.join(' ')
						.toLowerCase(),
				});
			}
		}
	}

	const haystack = index.map((i) => i.searchText);

	// intraIns: 1 allows one inserted character per term (catches single typos).
	const uf = new uFuzzy({ intraMode: 1, intraIns: 1 });

	// ---------------------------------------------------------------------------
	// Highlighting — applied per display field so marks appear in the right place
	// ---------------------------------------------------------------------------

	/** Wraps fuzzy-matched characters in <mark> for a single display field. */
	function highlight(text: string, q: string): string {
		if (!text || !q) return text;
		const [idxs, info, order] = uf.search([text.toLowerCase()], q.toLowerCase());
		if (!idxs?.length || !order?.length) return text;
		return uFuzzy.highlight(text, info.ranges[order[0]]);
	}

	const MAX_RESULTS = 50;

	// ---------------------------------------------------------------------------
	// State
	// ---------------------------------------------------------------------------

	let query = $state('');
	let focusedIndex = $state(0);
	let inputEl: HTMLInputElement | undefined = $state();

	const results = $derived.by(() => {
		const q = query.trim();
		if (!q) return [];
		const [idxs, , order] = uf.search(haystack, q.toLowerCase());
		if (!idxs?.length || !order?.length) return [];
		return order.slice(0, MAX_RESULTS).map((oi) => index[idxs[oi]]);
	});

	$effect(() => {
		query;
		focusedIndex = 0;
	});

	// ---------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------

	function openSearch() {
		open = true;
		query = '';
		focusedIndex = 0;
		requestAnimationFrame(() => inputEl?.focus());
	}

	function closeSearch() {
		open = false;
		query = '';
	}

	function navigateTo(item: SearchItem) {
		goto(`/contests/${item.contestId}#${item.year}`);
		closeSearch();
	}

	// ---------------------------------------------------------------------------
	// Keyboard handling
	// ---------------------------------------------------------------------------

	function onWindowKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
			e.preventDefault();
			open ? closeSearch() : openSearch();
			return;
		}
		if (!open) return;
		if (e.key === 'Escape') { closeSearch(); return; }
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			focusedIndex = Math.min(focusedIndex + 1, results.length - 1);
		}
		if (e.key === 'ArrowUp') {
			e.preventDefault();
			focusedIndex = Math.max(focusedIndex - 1, 0);
		}
		if (e.key === 'Enter' && results[focusedIndex]) {
			navigateTo(results[focusedIndex]);
		}
	}
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#if open}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 z-50 bg-black/50"
		transition:fade={{ duration: 120 }}
		role="presentation"
		onclick={closeSearch}
	></div>

	<!-- Dialog -->
	<div
		class="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[15vh] pointer-events-none"
		role="presentation"
	>
		<div
			class="pointer-events-auto flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
			role="dialog"
			aria-modal="true"
			aria-label="Search problems"
			transition:scale={{ duration: 150, start: 0.96 }}
		>
			<!-- Input row -->
			<div class="flex items-center gap-2 border-b border-border px-4 py-3">
				<SearchIcon class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
				<input
					bind:this={inputEl}
					bind:value={query}
					type="search"
					placeholder="Search by title, number, contest, or year…"
					class="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
				/>
				<button
					onclick={closeSearch}
					class={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'size-7 shrink-0')}
					aria-label="Close search"
				>
					<XIcon class="size-3.5" />
				</button>
			</div>

			<!-- Results -->
			<div class="max-h-[55vh] overflow-y-auto">
				{#if !query.trim()}
					<p class="py-8 text-center text-sm text-muted-foreground">
						Type to search across all olympiads…
					</p>
				{:else if results.length === 0}
					<p class="py-8 text-center text-sm text-muted-foreground">No results found.</p>
				{:else}
					<ul>
						{#each results as item, i (item.contestId + item.year + item.problem.number)}
							<li>
								<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
								<a
									href="/contests/{item.contestId}#{item.year}"
									onclick={(e) => { e.preventDefault(); navigateTo(item); }}
									onmousemove={() => (focusedIndex = i)}
									class={cn(
										'flex flex-col gap-1.5 border-b border-border/50 px-4 py-3 transition-colors last:border-0 hover:bg-muted/60',
										i === focusedIndex && 'bg-muted/60'
									)}
								>
									<!-- Contest + year -->
									<div class="flex items-center gap-1.5 text-xs text-muted-foreground">
										<span aria-hidden="true">{item.contestIcon}</span>
										<!-- eslint-disable-next-line svelte/no-at-html-tags -->
										<span>{@html highlight(item.contestName, query)}</span>
										<span aria-hidden="true">·</span>
										<!-- eslint-disable-next-line svelte/no-at-html-tags -->
										<span class="font-mono">{@html highlight(String(item.year), query)}</span>
									</div>

									<!-- Problem number + title -->
									<div class="flex items-baseline gap-2">
										<span class="font-mono text-sm font-semibold text-primary">
											<!-- eslint-disable-next-line svelte/no-at-html-tags -->
											{@html highlight(item.problem.number, query)}
										</span>
										{#if item.problem.title}
											<span class="text-sm font-medium text-foreground">
												<!-- eslint-disable-next-line svelte/no-at-html-tags -->
												{@html highlight(item.problem.title, query)}
											</span>
										{/if}
									</div>

									<!-- File badges -->
									{#if item.probFTEntries.some(([key]) => item.problem.files[key])}
										<div class="flex flex-wrap gap-1.5">
											{#each item.probFTEntries as [key, ft] (key)}
												{#if item.problem.files[key]}
													<Badge
														variant="outline"
														href={item.problem.files[key]}
														target="_blank"
														class="px-2 py-1 text-xs"
														onclick={(e: MouseEvent) => e.stopPropagation()}
													>
														{ft.label}
													</Badge>
												{/if}
											{/each}
										</div>
									{/if}
								</a>
							</li>
						{/each}
					</ul>
					{#if results.length === MAX_RESULTS}
						<p class="py-2 text-center text-xs text-muted-foreground">
							Showing first {MAX_RESULTS} results — refine your search to narrow down.
						</p>
					{/if}
				{/if}
			</div>

			<!-- Footer hints -->
			<div class="flex items-center gap-4 border-t border-border px-4 py-2 text-xs text-muted-foreground">
				<span><kbd class="font-mono">↑↓</kbd> navigate</span>
				<span><kbd class="font-mono">↵</kbd> go to year</span>
				<span><kbd class="font-mono">Esc</kbd> close</span>
				<span class="ml-auto font-mono">⌘K</span>
			</div>
		</div>
	</div>
{/if}

<style>
	:global(mark) {
		background: transparent;
		color: var(--primary);
		font-weight: 600;
	}
</style>