<script lang="ts">
	import type { SearchItem } from '$lib/types.js';
	import { rank, MAX_RESULTS } from '$lib/utils/fuzzy';
	import { Search } from '@lucide/svelte';
	import XIcon from '@lucide/svelte/icons/x';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import { cn } from '$lib/utils.js';
	import { goto } from '$app/navigation';
	import { Dialog } from 'bits-ui';
	import { resolve } from '$app/paths';
	import SearchResultItem from './SearchResultItem.svelte';
	import SearchHints from './SearchHints.svelte';

	/**
	 * The ⌘K search dialog, mounted once by the root layout.
	 *
	 * Everything stateful lives in this shell on purpose. `Dialog.Content` is
	 * wrapped in bits-ui's `{#if shouldRender}`, so its whole subtree unmounts
	 * when the dialog closes — state pushed into a child would be rebuilt on
	 * every open, and the session-long index cache below would quietly become a
	 * fetch per keystroke of ⌘K. The `<svelte:window>` handler has to stay out
	 * here for the same reason: it is what *opens* the dialog, so it could never
	 * fire from inside the content.
	 */
	let { open = $bindable(false) }: { open?: boolean } = $props();

	// ---------------------------------------------------------------------------
	// Index — fetched once on first open, then cached for the session
	// ---------------------------------------------------------------------------

	let index = $state<SearchItem[]>([]);
	let indexLoading = $state(false);
	let indexFailed = $state(false);
	let indexFetched = false;

	/**
	 * `indexFetched` is only set on success, so a failed attempt is retried the
	 * next time the dialog opens rather than leaving the session permanently
	 * unsearchable.
	 *
	 * The explicit `ok` check matters: an error response with an HTML body makes
	 * `res.json()` throw, which used to escape as an unhandled rejection and left
	 * the dialog claiming "No results found" as though the archive were empty.
	 */
	async function fetchIndex() {
		if (indexFetched) return;
		indexLoading = true;
		indexFailed = false;
		try {
			const res = await fetch('/api/search');
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			index = await res.json();
			indexFetched = true;
		} catch {
			indexFailed = true;
		} finally {
			indexLoading = false;
		}
	}

	$effect(() => {
		if (open) fetchIndex();
	});

	const haystack = $derived(index.map((i) => i.searchText));

	// ---------------------------------------------------------------------------
	// State
	// ---------------------------------------------------------------------------

	let query = $state('');
	let focusedIndex = $state(0);
	let inputEl: HTMLInputElement | undefined = $state();
	let resultsEl: HTMLDivElement | undefined = $state();

	const results = $derived.by(() => (indexLoading ? [] : rank(index, haystack, query)));

	// Reset the keyboard highlight to the top whenever the query changes.
	$effect(() => {
		const _query = query; // tracked dependency
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

	/**
	 * Keeps the keyboard-focused row visible.
	 *
	 * Reaches into the DOM rather than holding element references, since the rows
	 * are rendered by a child. The lookup is optional-chained at both ends: the
	 * container is undefined before mount, and an empty result list makes any
	 * index out of range.
	 */
	function scrollFocusedIntoView() {
		const row = resultsEl?.querySelectorAll('li')[focusedIndex];
		row?.scrollIntoView({ block: 'nearest' });
	}

	// ---------------------------------------------------------------------------
	// Keyboard handling
	// ---------------------------------------------------------------------------

	function onWindowKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
			e.preventDefault();
			if (open) {
				closeSearch();
			} else {
				openSearch();
			}
			return;
		}
		if (!open) return;
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			focusedIndex = Math.min(focusedIndex + 1, results.length - 1);
			scrollFocusedIntoView();
		}
		if (e.key === 'ArrowUp') {
			e.preventDefault();
			focusedIndex = Math.max(focusedIndex - 1, 0);
			scrollFocusedIntoView();
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
			class="fixed inset-0 z-50 bg-white/30 backdrop-blur-md
			       dark:bg-black/30
			       data-open:animate-in data-open:duration-150 data-open:fade-in-0
			       data-closed:animate-out data-closed:duration-150 data-closed:fade-out-0"
		/>

		<div class="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
			<Dialog.Content
				class="pointer-events-auto flex h-[min(600px,72vh)] w-full max-w-xl flex-col overflow-hidden rounded-2xl
					   bg-popover text-popover-foreground md:backdrop-blur-lg
				       data-open:animate-in data-open:duration-200 data-open:fade-in-0 data-open:zoom-in-[0.97]
				       data-closed:animate-out data-closed:duration-150 data-closed:fade-out-0 data-closed:zoom-out-[0.97]"
				onOpenAutoFocus={(e) => {
					e.preventDefault();
					inputEl?.focus();
				}}
				onCloseAutoFocus={(e) => {
					e.preventDefault();
				}}
			>
				<Dialog.Title class="sr-only">Search problems</Dialog.Title>

				<!-- Input row -->
				<div class="glass-hairline flex items-center gap-3 border-b px-4 py-3">
					<Search class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
					<input
						bind:this={inputEl}
						bind:value={query}
						type="search"
						placeholder="Search for problems… (fuzzy)"
						class="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
					/>
					<Dialog.Close
						class={cn(
							buttonVariants({ variant: 'ghost', size: 'icon' }),
							'border border-white/50 bg-white/30 hover:bg-white/50 dark:border-white/10 dark:bg-white/5'
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
					{:else if indexFailed}
						<div class="m-auto flex flex-col gap-2 px-5">
							<p class="text-center text-sm text-destructive">Couldn't load the search index.</p>
							<p class="text-center text-sm text-muted-foreground">
								Close this and reopen it to try again.
							</p>
						</div>
					{:else if !query.trim()}
						<div class="m-auto flex flex-col gap-2 px-5">
							<p class="text-center text-sm text-muted-foreground">
								Type to search for problems across all olympiads…
							</p>
							<p class="text-center text-sm text-muted-foreground">
								Search in the order: olympiad name, year, and problem title
							</p>
						</div>
					{:else if results.length === 0}
						<p class="flex flex-1 items-center justify-center text-sm text-muted-foreground">
							No results found.
						</p>
					{:else}
						<ul>
							{#each results as item, i (item.olympiadId + item.year + item.problem.number)}
								<SearchResultItem
									{item}
									{query}
									focused={i === focusedIndex}
									onactivate={() => navigateTo(item)}
									onhover={() => (focusedIndex = i)}
								/>
							{/each}
						</ul>
						{#if results.length === MAX_RESULTS}
							<p class="py-2 text-center text-xs text-muted-foreground">
								Showing first {MAX_RESULTS} results — refine your search to narrow down.
							</p>
						{/if}
					{/if}
				</div>

				<SearchHints />
			</Dialog.Content>
		</div>
	</Dialog.Portal>
</Dialog.Root>
