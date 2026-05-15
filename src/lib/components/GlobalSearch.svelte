<script lang="ts">
	import uFuzzy from '@leeoniya/ufuzzy';
	import type { SearchItem } from '$lib/types.js';
	import { Search } from '@lucide/svelte';
	import XIcon from '@lucide/svelte/icons/x';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import Badge from '$lib/components/ui/badge/badge.svelte';
	import OlympiadIcon from '$lib/components/OlympiadIcon.svelte';
	import { cn } from '$lib/utils.js';
	import { goto } from '$app/navigation';
	import { Dialog } from 'bits-ui';
	import { resolve } from '$app/paths';
	import * as Kbd from '$lib/components/ui/kbd/index.js';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	const uf = new uFuzzy({ intraMode: 1, intraIns: 1 });

	// ---------------------------------------------------------------------------
	// Index — fetched once on first open, then cached for the session
	// ---------------------------------------------------------------------------

	let index = $state<SearchItem[]>([]);
	let indexLoading = $state(false);
	let indexFetched = false;

	async function fetchIndex() {
		if (indexFetched) return;
		indexLoading = true;
		try {
			const res = await fetch('/api/search');
			index = await res.json();
			indexFetched = true;
		} finally {
			indexLoading = false;
		}
	}

	$effect(() => {
		if (open) fetchIndex();
	});

	const haystack = $derived(index.map((i) => i.searchText));

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
		if (!q || indexLoading) return [];
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
		goto(resolve(`/olympiads/${item.olympiadId}#${item.year}`));
		closeSearch();
	}

	// ---------------------------------------------------------------------------
	// Keyboard handling
	// ---------------------------------------------------------------------------

	function onWindowKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
			e.preventDefault();
			if (open) { closeSearch(); } else { openSearch(); }
			return;
		}
		if (!open) return;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			focusedIndex = Math.min(focusedIndex + 1, results.length - 1);
			resultsEl?.querySelectorAll('li')[focusedIndex].scrollIntoView({ block: 'nearest' });
		}
		if (e.key === 'ArrowUp') {
			e.preventDefault();
			focusedIndex = Math.max(focusedIndex - 1, 0);
			resultsEl?.querySelectorAll('li')[focusedIndex].scrollIntoView({ block: 'nearest' });
		}
		if (e.key === 'Enter' && results[focusedIndex]) {
			navigateTo(results[focusedIndex]);
		}
	}
</script>

<svelte:window onkeydown={onWindowKeydown} />

<Dialog.Root bind:open>
	<Dialog.Portal>
		<!-- Backdrop -->
		<Dialog.Overlay
			class="fixed inset-0 z-50 bg-black/30 dark:bg-black/50
			       supports-backdrop-filter:backdrop-blur-sm
			       data-open:animate-in data-open:duration-150 data-open:fade-in-0
			       data-closed:animate-out data-closed:duration-150 data-closed:fade-out-0"
		/>

		<div class="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
			<Dialog.Content
				class="pointer-events-auto flex h-[min(600px,72vh)] w-full max-w-xl flex-col overflow-hidden rounded-2xl
					bg-white/55 dark:bg-white/6
					border border-white/70 dark:border-white/10
					backdrop-blur-lg
					shadow-md shadow-black/5 dark:shadow-black/20
					ring-1 ring-inset ring-white/50 dark:ring-white/5
				       data-open:animate-in data-open:duration-200 data-open:fade-in-0 data-open:zoom-in-[0.97]
				       data-closed:animate-out data-closed:duration-150 data-closed:fade-out-0 data-closed:zoom-out-[0.97]"
				onOpenAutoFocus={(e) => { e.preventDefault(); inputEl?.focus(); }}
				onCloseAutoFocus={(e) => { e.preventDefault(); }}
			>
				<Dialog.Title class="sr-only">Search problems</Dialog.Title>

				<!-- Input row -->
				<div class="flex items-center gap-3 border-b border-white/50 dark:border-white/10 px-4 py-3">
					<Search class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
					<input
						bind:this={inputEl}
						bind:value={query}
						type="search"
						placeholder="Search for problems… (fuzzy)"
						class="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
					/>
					<Dialog.Close
						class={cn(buttonVariants({ variant: 'ghost', size: 'icon' }),
							'bg-white/30 dark:bg-white/5 border border-white/50 dark:border-white/10 hover:bg-white/50'
						)}
						aria-label="Close search"
					>
						<XIcon class="size-4" />
					</Dialog.Close>
				</div>

				<!-- Results -->
				<div bind:this={resultsEl} class="flex min-h-0 flex-1 flex-col overflow-y-auto">
					{#if indexLoading}
						<div class="m-auto">
							<p class="text-center text-sm text-muted-foreground">Loading search index…</p>
						</div>
					{:else if !query.trim()}
						<div class="m-auto px-5 flex flex-col gap-2">
							<p class="text-center text-sm text-muted-foreground">
								Type to search for problems across all olympiads…
							</p>
							<p class="text-center text-xs text-muted-foreground/70">
								Tip: search by olympiad name, year, or problem title
							</p>
						</div>
					{:else if results.length === 0}
						<p class="flex flex-1 items-center justify-center text-sm text-muted-foreground">
							No results found.
						</p>
					{:else}
						<ul>
							{#each results as item, i (item.olympiadId + item.year + item.problem.number)}
								<li>
									<a
										href={resolve(`/olympiads/${item.olympiadId}#${item.year}`)}
										onclick={(e) => { e.preventDefault(); navigateTo(item); }}
										onmousemove={() => (focusedIndex = i)}
										class={cn(
											'flex flex-col gap-1.5 border-b border-white/40 dark:border-white/8 px-4 py-3 transition-all duration-150 last:border-0',
											i === focusedIndex
												? 'bg-white/50 dark:bg-white/8'
												: 'hover:bg-white/35 dark:hover:bg-white/5'
										)}
									>
										<!-- Olympiad + year -->
										<div class="flex items-center gap-1.5 text-muted-foreground">
											<OlympiadIcon
												icon={item.olympiadIcon}
												id={item.olympiadId}
												class="h-4 w-auto shrink-0 text-base"
											/>
											<!-- eslint-disable-next-line svelte/no-at-html-tags -->
											<span>{@html highlight(item.olympiadName, query)}</span>
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

										{#if item.problem.files.length > 0}
											<div class="flex flex-wrap gap-1.5">
												{#each item.problem.files as file (file.label)}
													<Badge
														variant="outline"
														href={file.url}
														target="_blank"
														class="px-2 py-1 text-xs
														       bg-white/50 dark:bg-white/8
														       border-white/70 dark:border-white/12
														       backdrop-blur-sm"
														onclick={(e: MouseEvent) => e.stopPropagation()}
													>
														{file.label}
													</Badge>
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
					class="hidden items-center gap-4 border-t border-white/50 dark:border-white/10 px-4 py-2.5 text-xs text-muted-foreground md:flex
					       bg-white/20 dark:bg-white/3"
				>
					<span><Kbd.Root>↑↓</Kbd.Root> navigate</span>
					<span><Kbd.Root>↵</Kbd.Root> go to year</span>
					<span><Kbd.Root>Esc</Kbd.Root> close</span>
					<span class="ml-auto flex gap-1">
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