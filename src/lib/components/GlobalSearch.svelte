<script lang="ts">
	import uFuzzy from '@leeoniya/ufuzzy';
	import searchIndex from '$lib/pregen/output/searchIndex.json';
	import type { ProblemEntry, SearchIndex, SearchItem } from '$lib/pregen/types.js';
	import { Search } from '@lucide/svelte';
	import XIcon from '@lucide/svelte/icons/x';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import Badge from '$lib/components/ui/badge/badge.svelte';
	import { cn } from '$lib/utils.js';
	import { goto } from '$app/navigation';
	import { Dialog } from 'bits-ui';
	import * as Kbd from '$lib/components/ui/kbd/index.js';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	// ---------------------------------------------------------------------------
	// Search index — lifted from pregenerated searchIndex.json
	// ---------------------------------------------------------------------------


	const index: SearchItem[] = searchIndex.items.map((item) => {
		const meta = (searchIndex as unknown as SearchIndex).contestMeta[item.contestId];
		return {
			...item,
			problem: item.problem as ProblemEntry,
			contestName: meta.name,
			contestIcon: meta.icon,
			probFTEntries: meta.probFTEntries
		};
	});

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
	let resultsEl: HTMLDivElement | undefined = $state();

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
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			focusedIndex = Math.min(focusedIndex + 1, results.length - 1);
			resultsEl?.querySelectorAll('li')[focusedIndex]?.scrollIntoView({ block: 'nearest' });
		}
		if (e.key === 'ArrowUp') {
			e.preventDefault();
			focusedIndex = Math.max(focusedIndex - 1, 0);
			resultsEl?.querySelectorAll('li')[focusedIndex]?.scrollIntoView({ block: 'nearest' });
		}
		if (e.key === 'Enter' && results[focusedIndex]) {
			navigateTo(results[focusedIndex]);
		}
	}
</script>

<svelte:window onkeydown={onWindowKeydown} />

<!--
	bits-ui Dialog.Root manages open state and provides scroll locking + focus
	trapping via Dialog.Content. Escape to close is also handled automatically.
	onOpenChange fires when the primitive closes the dialog (e.g. Escape or
	clicking the overlay), so we keep our internal state in sync.
-->
<Dialog.Root bind:open>
	<Dialog.Portal>
		<!-- Backdrop -->
		<Dialog.Overlay
			class="fixed inset-0 z-50 bg-black/50 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 data-closed:duration-150 data-open:duration-150"
		/>

		<!-- Centering wrapper (not the dialog itself, so it doesn't interfere with a11y) -->
		<div class="pointer-events-none fixed inset-0 z-50 flex items-start justify-center px-4 pt-[15vh]">
			<Dialog.Content
				class="pointer-events-auto flex h-[min(600px,72vh)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl data-open:animate-in data-open:fade-in-0 data-open:zoom-in-[0.96] data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-[0.96] data-closed:duration-150 data-open:duration-150"
				onOpenAutoFocus={(e) => { e.preventDefault(); inputEl?.focus(); }}
				onCloseAutoFocus={(e) => { e.preventDefault(); }}
			>
				<!--
					Dialog.Title is required by ARIA for dialog elements.
					sr-only hides it visually without removing it from the a11y tree.
				-->
				<Dialog.Title class="sr-only">Search problems</Dialog.Title>

				<!-- Input row -->
				<div class="flex items-center gap-2 border-b border-border px-4 py-3">
					<Search class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
					<input
						bind:this={inputEl}
						bind:value={query}
						type="search"
						placeholder="Search by title, number, contest, or year…"
						class="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
					/>
					<Dialog.Close
						class={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}
						aria-label="Close search"
					>
						<XIcon class="size-4" />
					</Dialog.Close>
				</div>

				<!-- Results -->
				<div bind:this={resultsEl} class="flex min-h-0 flex-1 flex-col overflow-y-auto">
					{#if !query.trim()}
						<p class="flex flex-1 items-center justify-center text-sm text-muted-foreground">
							Type to search across all olympiads…
						</p>
					{:else if results.length === 0}
						<p class="flex flex-1 items-center justify-center text-sm text-muted-foreground">No results found.</p>
					{:else}
						<ul>
							{#each results as item, i (item.contestId + item.year + item.problem.number)}
								<li>
									<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
									<a
										href="/contests/{item.contestId}#{item.year}"
										onclick={(e) => {
											e.preventDefault();
											navigateTo(item);
										}}
										onmousemove={() => (focusedIndex = i)}
										class={cn(
											'flex flex-col gap-1.5 border-b border-border/50 px-4 py-3 transition-colors last:border-0 hover:bg-muted/60',
											i === focusedIndex && 'bg-muted/60'
										)}
									>
										<!-- Contest + year -->
										<div class="flex items-center gap-1.5 text-muted-foreground">
											<span aria-hidden="true">{item.contestIcon}</span>
											<!-- eslint-disable-next-line svelte/no-at-html-tags -->
											<span>{@html highlight(item.contestName, query)}</span>
											<span aria-hidden="true">·</span>
											<!-- eslint-disable-next-line svelte/no-at-html-tags -->
											<span class="font-mono">{@html highlight(String(item.year), query)}</span>
										</div>

										<!-- Problem number + title -->
										<div class="flex items-baseline gap-2">
											<span class="font-mono font-semibold text-primary">
												<!-- eslint-disable-next-line svelte/no-at-html-tags -->
												{@html highlight(item.problem.number, query)}
											</span>
											{#if item.problem.title}
												<span class="font-medium text-foreground">
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
															class="px-2 py-1 text-sm"
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
				<div
					class="hidden md:flex items-center gap-4 border-t border-border px-4 py-2 text-xs text-muted-foreground"
				>
					<span><Kbd.Root>↑↓</Kbd.Root> navigate</span>
					<span><Kbd.Root>↵</Kbd.Root> go to year</span>
					<span><Kbd.Root>Esc</Kbd.Root> close</span>
					<span class="ml-auto">
						<Kbd.Root>⌘</Kbd.Root>
						<Kbd.Root>K</Kbd.Root>
					</span>
				</div>
			</Dialog.Content>
		</div>
	</Dialog.Portal>
</Dialog.Root>

<style>
	:global(mark) {
		background: transparent;
		color: var(--primary);
		font-weight: 600;
	}
</style>