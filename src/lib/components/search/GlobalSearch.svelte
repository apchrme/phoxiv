<script lang="ts">
	import type { ProblemTopic, SearchItem, SearchMode } from '$lib/types.js';
	import { rank, MAX_RESULTS } from '$lib/utils/fuzzy';
	import { Search, SearchX, TriangleAlert } from '@lucide/svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { plural } from '$lib/utils/plural';
	import XIcon from '@lucide/svelte/icons/x';
	import { Button, buttonVariants } from '$lib/components/ui/button/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { cn } from '$lib/utils.js';
	import { goto } from '$app/navigation';
	import { Dialog } from 'bits-ui';
	import { resolve } from '$app/paths';
	import SearchResultItem from './SearchResultItem.svelte';
	import FileResultItem from './FileResultItem.svelte';
	import SearchHints from './SearchHints.svelte';
	import SearchModeTabs from './SearchModeTabs.svelte';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { DeepSearch, deepCacheKey } from './deep-search.svelte';
	import TopicSelect from '$lib/components/TopicSelect.svelte';
	import StatusFilter from '$lib/components/StatusFilter.svelte';
	import OlympiadPicker from '$lib/components/OlympiadPicker.svelte';
	import { filterSearchItems, isFiltering, type ProblemStatus } from '$lib/filters';
	import { Resource } from '$lib/resource.svelte';
	import type { GlobalProgressMap } from '$lib/progress';
	import type { FileSearchResult, OlympiadEntry } from '$lib/types.js';
	import {
		DEEP_DEBOUNCE_MS,
		DEEP_SEARCH_LIMIT,
		MAX_DEEP_QUERY_LENGTH,
		MIN_DEEP_QUERY_LENGTH,
		normalizeDeepQuery
	} from '$lib/search';

	/**
	 * The ⌘K search dialog, mounted once by the root layout.
	 *
	 * All state lives in this shell because bits-ui unmounts `Dialog.Content`'s
	 * subtree on close; state in a child would be rebuilt, and its caches
	 * refetched, on every open. The `<svelte:window>` handler opens the dialog,
	 * so it must live out here too.
	 *
	 * Two modes, two `Tabs.Content` panels, but only one list is ever active:
	 * arrows and Enter work over one array. bits-ui keeps the inactive panel
	 * mounted (just `hidden`), so each panel guards its body on the mode.
	 *
	 * Network, each fetched once and cached for the session: the problem index
	 * (first open), `/progress` (first open when signed in, and when `userId`
	 * changes), `/api/olympiads` (first entry into files mode), and deep-search
	 * responses per (query, olympiad) key.
	 */
	let {
		open = $bindable(false),
		userId,
		currentOlympiad
	}: {
		open?: boolean;
		/**
		 * The signed-in user's id, or `undefined`. Passed in by `+layout.svelte`
		 * rather than read from `page.data`, which would tie a `$lib` component to
		 * the root layout's load shape.
		 */
		userId?: string;
		/**
		 * The olympiad whose page the reader is on, if any. Only passed to
		 * `OlympiadPicker`, which lists it first; it never presets
		 * `olympiadFilter`.
		 */
		currentOlympiad?: string;
	} = $props();

	const signedIn = $derived(userId !== undefined);

	/** One shared empty array, so `visibleDeepResults` keeps referential identity. */
	const NO_HITS: readonly FileSearchResult[] = [];

	// ---------------------------------------------------------------------------
	// Index — fetched once on first open, then cached for the session
	// ---------------------------------------------------------------------------

	/**
	 * `Resource` holds the body in `$state.raw` (a deep proxy over thousands of
	 * items would slow the per-keystroke filter), keeps only a success, so a
	 * failure is retried on the next open, and joins a request already in flight,
	 * so repeated ⌘K presses send one.
	 */
	const indexSource = new Resource<SearchItem[]>('/api/search');
	const NO_ITEMS: SearchItem[] = [];
	const index = $derived(indexSource.value ?? NO_ITEMS);
	const indexLoading = $derived(indexSource.loading);
	const indexFailed = $derived(indexSource.failed);

	$effect(() => {
		if (open) void indexSource.loadOnce();
	});

	// ---------------------------------------------------------------------------
	// Progress — the whole archive, so the status filter can span it
	// ---------------------------------------------------------------------------

	/** `$state.raw` for `index`'s reason: replaced wholesale, read per keystroke. */
	let progress = $state.raw<GlobalProgressMap>({});
	/** Drives one hint line, so a "Done" filter chosen before the map lands doesn't read as an empty archive. */
	let progressLoading = $state(false);
	/**
	 * The user whose map is in `progress`. A plain `let`: the effect below reads
	 * and writes it, so `$state` would loop.
	 */
	let progressFetchedFor: string | undefined = undefined;
	/**
	 * The user whose map is being fetched. Stops duplicate `/progress` requests
	 * (uncached, so each is a real D1 read). Keyed by user so a different user's
	 * map can still be fetched meanwhile.
	 *
	 * A plain `let`, and don't guard on `progressLoading` instead: it is `$state`
	 * written by `fetchProgress`, so after a failure the effect would refetch in
	 * a loop.
	 */
	let progressInFlightFor: string | undefined = undefined;

	async function fetchProgress(id: string) {
		progressInFlightFor = id;
		progressLoading = true;
		try {
			const res = await fetch('/progress');
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const fetched: GlobalProgressMap = await res.json();
			// Discard a response for a user who has since signed out or changed.
			if (userId !== id) return;
			progress = fetched;
			progressFetchedFor = id;
		} catch {
			// No toast: tracking is an enhancement. `progressFetchedFor` stays unset,
			// so the next open retries.
		} finally {
			// Guarded so a superseded user's request can't clear the newer key.
			if (progressInFlightFor === id) progressInFlightFor = undefined;
			progressLoading = false;
		}
	}

	$effect(() => {
		const id = userId;
		if (!id) {
			// Reset `status` too: `StatusFilter` is hidden when signed out, so a
			// leftover status filter would empty the list invisibly.
			progress = {};
			progressLoading = false;
			progressFetchedFor = undefined;
			progressInFlightFor = undefined;
			status = 'all';
			return;
		}
		if (!open || progressFetchedFor === id || progressInFlightFor === id) return;
		fetchProgress(id);
	});

	// ---------------------------------------------------------------------------
	// State
	// ---------------------------------------------------------------------------

	let query = $state('');
	let mode = $state<SearchMode>('problems');
	/** Topics the user is filtering by. Empty means no topic filter. */
	let activeTopics = $state<ProblemTopic[]>([]);
	/** Completion state the user is filtering by. Signed-in only. */
	let status = $state<ProblemStatus>('all');
	/**
	 * The olympiad deep search is scoped to, or `null` for all. Files mode only:
	 * a file belongs to exactly one olympiad, but may cover every topic.
	 */
	let olympiadFilter = $state<string | null>(null);

	let focusedIndex = $state(0);
	let inputEl: HTMLInputElement | undefined = $state();
	/** One scroller per panel; `resultsEl` below picks the current one. */
	let problemsPanelEl: HTMLDivElement | undefined = $state();
	let filesPanelEl: HTMLDivElement | undefined = $state();

	/** Created once in the shell, so the deep-search cache survives open and close. */
	const deep = new DeepSearch();

	const filtering = $derived(isFiltering({ topics: activeTopics, status }));

	/**
	 * Split into three deriveds so typing doesn't rerun the filter, and progress
	 * changes don't rerun the fuzzy match.
	 */
	const filteredIndex = $derived.by(() =>
		filterSearchItems(index, { topics: activeTopics, status }, progress)
	);
	/**
	 * The strings `rank` matches, parallel to `filteredIndex`. Must be built from
	 * the filtered array, since `rank` maps haystack positions back to items.
	 */
	const filteredHaystack = $derived(filteredIndex.map((i) => i.searchText));

	const results = $derived.by(() => {
		if (indexLoading) return [];
		// Filter before ranking, never after: `rank()` caps at MAX_RESULTS, so
		// filtering its output would drop matches further down.
		if (query.trim()) return rank(filteredIndex, filteredHaystack, query);
		// An empty query with a filter set lists the filtered pool (in
		// `getSearchIndex`'s order), e.g. "every relativity problem I haven't
		// done". `rank()` returns [] for an empty query, so bypass it.
		return filtering ? filteredIndex.slice(0, MAX_RESULTS) : [];
	});

	// ---------------------------------------------------------------------------
	// Olympiads — for the deep-search filter, on first entry into files mode
	// ---------------------------------------------------------------------------

	/**
	 * Every olympiad, for `OlympiadPicker`. Fetched on first entry into files
	 * mode, so ⌘K costs nothing extra for people who never use deep search.
	 *
	 * Don't derive it from `index`: that has one entry per problem, so it would
	 * miss an olympiad with files but no problems.
	 *
	 * No loading or error UI: until the list lands the filter just isn't shown,
	 * and a failure retries on the next entry into files mode.
	 */
	const olympiadsSource = new Resource<OlympiadEntry[]>('/api/olympiads');
	const NO_OLYMPIADS: OlympiadEntry[] = [];
	const olympiads = $derived(olympiadsSource.value ?? NO_OLYMPIADS);

	$effect(() => {
		if (open && mode === 'files') void olympiadsSource.loadOnce();
	});

	// ---------------------------------------------------------------------------
	// Deep search
	// ---------------------------------------------------------------------------

	/** Normalised here so equivalent queries share one Cloudflare cache key. */
	const deepQuery = $derived(normalizeDeepQuery(query));
	const deepTooShort = $derived(deepQuery.length > 0 && deepQuery.length < MIN_DEEP_QUERY_LENGTH);
	/**
	 * Checked on the client too, so an over-long paste gets a clear message
	 * instead of a server 400 shown as a failure whose "Try again" can never
	 * succeed.
	 */
	const deepTooLong = $derived(deepQuery.length > MAX_DEEP_QUERY_LENGTH);

	/**
	 * The key `DeepSearch` stores everything under: query plus olympiad. Keying
	 * on the query alone would show the previous olympiad's results. The length
	 * checks stay on `deepQuery`.
	 */
	const deepKey = $derived(deepCacheKey(deepQuery, olympiadFilter));

	/** The filtered olympiad's display name, for the empty state. */
	const filteredOlympiadName = $derived(
		olympiadFilter === null ? null : (olympiads.find((o) => o.id === olympiadFilter)?.name ?? null)
	);

	/**
	 * The debounce is the effect's teardown: it runs just before each rerun, so
	 * `clearTimeout` cancels a request not yet sent and `abort()` cancels one
	 * that was.
	 *
	 * Every tracked read must be synchronous and above the `setTimeout`. The
	 * fetch must create no dependency, or a landing response would re-trigger it;
	 * that is why `deep.has()` reads a plain `Map`. `schedule()` / `unschedule()`
	 * only write state, so they add no dependency either.
	 */
	$effect(() => {
		if (mode !== 'files') return;
		const key = deepKey;
		const query = deepQuery;
		const olympiad = olympiadFilter;
		const _attempt = deep.attempt; // tracked: lets "Try again" re-fire the same query
		if (query.length < MIN_DEEP_QUERY_LENGTH) return;
		// Refuse, don't truncate: a cut mid-word would become a prefix term and
		// change the results.
		if (query.length > MAX_DEEP_QUERY_LENGTH) return;

		// A cache hit is shown synchronously, with no spinner.
		if (deep.has(key)) {
			deep.show(key);
			return;
		}

		// Pending from here, not inside the timer. See `DeepSearch.schedule`.
		deep.schedule(key);
		const controller = new AbortController();
		const timer = setTimeout(
			() => void deep.run(key, query, olympiad, controller.signal),
			DEEP_DEBOUNCE_MS
		);
		return () => {
			clearTimeout(timer);
			controller.abort();
			// Guarded inside `unschedule`, so it can't clear the next key's state.
			deep.unschedule(key);
		};
	});

	// ---------------------------------------------------------------------------
	// Shared list state
	// ---------------------------------------------------------------------------

	const inFiles = $derived(mode === 'files');

	/** The scroller the visible rows are in, so the scroll helper stays mode-blind. */
	const resultsEl = $derived(inFiles ? filesPanelEl : problemsPanelEl);

	/**
	 * The panel avoids flicker through branch order: too long → failed → too
	 * short → empty and loading → empty → the list. A newer query dims the last
	 * list instead of clearing it. `deepLoading` covers the debounce too.
	 */
	const deepFailed = $derived(inFiles && deep.hasFailed(deepKey));
	const deepLoading = $derived(inFiles && deep.isLoading(deepKey));
	const deepStale = $derived(inFiles && deep.isStale(deepKey));

	/**
	 * The file rows actually on screen. `deep.results` keeps the last list even
	 * when the panel shows something else (failure, too short, too long), and the
	 * keyboard must not address rows that aren't rendered. Keep these conditions
	 * in step with the panel's branches.
	 */
	const visibleDeepResults = $derived(
		deepTooLong || deepFailed || deepQuery.length < MIN_DEEP_QUERY_LENGTH ? NO_HITS : deep.results
	);

	/**
	 * How many rows the keyboard may address, derived from what is rendered:
	 * every branch that renders no `<ul>` must give zero here.
	 */
	const resultCount = $derived(inFiles ? visibleDeepResults.length : results.length);

	/**
	 * The row the keyboard is on: `focusedIndex` clamped on read, because a
	 * response can shrink the list under it. Don't clamp by writing
	 * `focusedIndex` back from an effect; that risks a loop.
	 */
	const focused = $derived(resultCount === 0 ? 0 : Math.min(focusedIndex, resultCount - 1));

	// Reset the keyboard highlight to the top whenever what is listed changes.
	$effect(() => {
		// `join()` so this tracks the contents, whether TopicSelect mutates or reassigns.
		const _deps = [query, mode, status, olympiadFilter, activeTopics.join()]; // tracked dependencies
		focusedIndex = 0;
	});

	/**
	 * Resets query, filters and mode on every open, however it was opened. A
	 * filter left over from last time would be invisible, and ⌘K must never start
	 * in files mode, which hits the network.
	 *
	 * Caches are kept, so a reopen costs no requests. This only writes these
	 * cells, never reads them, so its only dependency is `open`.
	 */
	$effect(() => {
		if (!open) return;
		query = '';
		mode = 'problems';
		activeTopics = [];
		status = 'all';
		olympiadFilter = null;
		focusedIndex = 0;
		deep.reset();
	});

	// ---------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------

	/** Clears every filter, including the olympiad one, even from problem mode. */
	function clearFilters() {
		activeTopics = [];
		status = 'all';
		olympiadFilter = null;
	}

	function navigateTo(item: SearchItem) {
		goto(resolve(`/olympiads/${item.olympiadId}#${item.year}`));
		open = false;
	}

	/**
	 * Opens whatever the keyboard is on. A file row's anchor has no handler, so
	 * Enter opens the new tab itself, falling back to same-tab if blocked. The
	 * dialog stays open for a file.
	 */
	function activateFocused() {
		// `focused`, not `focusedIndex`: only the clamped, visible row may open.
		if (inFiles) {
			const hit = visibleDeepResults[focused];
			if (!hit) return;
			const opened = window.open(hit.file.url, '_blank', 'noopener,noreferrer');
			if (!opened) window.location.href = hit.file.url;
			return;
		}
		const item = results[focused];
		if (item) navigateTo(item);
	}

	/**
	 * Keeps the keyboard-focused row visible. Looks rows up by
	 * `[data-result-index]`, not position, because the scroller holds other
	 * elements too.
	 */
	function scrollFocusedIntoView() {
		// `focused`: an unclamped index might match no row.
		resultsEl
			?.querySelector(`[data-result-index="${focused}"]`)
			?.scrollIntoView({ block: 'nearest' });
	}

	// ---------------------------------------------------------------------------
	// Keyboard handling
	// ---------------------------------------------------------------------------

	function onWindowKeydown(e: KeyboardEvent) {
		const key = e.key.toLowerCase();

		// Lowercased: with caps lock on, `e.key` is `'K'`.
		if ((e.metaKey || e.ctrlKey) && !e.shiftKey && key === 'k') {
			e.preventDefault();
			open = !open;
			return;
		}
		if (!open) return;

		// ⌘⇧F toggles the mode. Not ⌘⇧K, which is Firefox's Web Console.
		if ((e.metaKey || e.ctrlKey) && e.shiftKey && key === 'f') {
			e.preventDefault();
			mode = inFiles ? 'problems' : 'files';
			inputEl?.focus();
			return;
		}

		// Only while focus is in the input, or an open filter dropdown and the list
		// would both react to the arrows.
		if (e.target !== inputEl) return;

		// During IME composition, Enter and arrows belong to the candidate list.
		// Below the chords, so ⌘K can still close the dialog mid-composition.
		if (e.isComposing) return;

		if (e.key === 'ArrowDown') {
			e.preventDefault();
			// From `focused`, the row on screen. `Math.max` stops an empty list
			// setting -1.
			focusedIndex = Math.min(focused + 1, Math.max(resultCount - 1, 0));
			scrollFocusedIntoView();
		}
		if (e.key === 'ArrowUp') {
			e.preventDefault();
			focusedIndex = Math.max(focused - 1, 0);
			scrollFocusedIntoView();
		}
		if (e.key === 'Enter') activateFocused();
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
				<Dialog.Title class="sr-only">
					{inFiles ? 'Search inside files' : 'Search problems'}
				</Dialog.Title>

				<!-- Not `bind:value`: bits-ui types `value` as `string`, which won't bind to
				     `SearchMode`. `mode` stays the single source of truth. -->
				<Tabs.Root
					value={mode}
					onValueChange={(v) => (mode = v as SearchMode)}
					class="min-h-0 flex-1 gap-0"
				>
					<!-- Mode row: the tabs and the close button, keeping the input row narrow. -->
					<div class="flex items-center gap-2 border-b glass-hairline px-3 py-2">
						<SearchModeTabs onactivate={() => inputEl?.focus()} />
						<Dialog.Close
							class={cn(
								buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
								'ml-auto border border-white/50 bg-white/30 hover:bg-white/50 dark:border-white/10 dark:bg-white/5'
							)}
							aria-label="Close search"
						>
							<XIcon class="size-4" />
						</Dialog.Close>
					</div>

					<!-- Input row. Keep `min-w-0` on the input: without it the input won't
					     shrink below ~20 characters and the row overflows (and is clipped). -->
					<div class="flex items-center gap-2 border-b glass-hairline px-4 py-3">
						{#if deepLoading}
							<!-- Replaces the magnifier: the row has no width to spare. -->
							<Spinner class="size-4 shrink-0 text-muted-foreground" />
						{:else}
							<Search class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
						{/if}
						<input
							bind:this={inputEl}
							bind:value={query}
							type="search"
							placeholder={inFiles ? 'Search inside files…' : 'Search for problems… (fuzzy)'}
							autocomplete="off"
							autocapitalize="off"
							spellcheck="false"
							enterkeyhint="go"
							class="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
						/>
						<div class="flex shrink-0 items-center gap-1">
							<!-- Each mode shows only its own filters. Hidden, not disabled: a disabled
							     TopicSelect would still look active. Values are kept across switches. -->
							{#if inFiles}
								<!-- Absent until `/api/olympiads` lands, rather than an empty picker. -->
								{#if olympiads.length > 0}
									<OlympiadPicker
										trigger="icon"
										allowAll
										heading="Filter by olympiad"
										bind:value={olympiadFilter}
										{olympiads}
										{currentOlympiad}
									/>
								{/if}
							{:else}
								<TopicSelect
									bind:value={activeTopics}
									label="All topics"
									heading="Filter by topic"
									align="end"
									size="icon-sm"
									iconOnly
								/>
								{#if signedIn}
									<!-- Signed-in only: without a session nothing is "Done". -->
									<StatusFilter bind:value={status} size="icon-sm" />
								{/if}
							{/if}
						</div>
					</div>

					<!-- Count only: echoing rows would reread the list on every keystroke. -->
					<p class="sr-only" role="status" aria-live="polite">
						{plural(resultCount, 'result')}
					</p>

					<!-- Keep the `{#if}` inside each panel: bits-ui leaves the inactive panel
					     mounted, so without it the problems panel would rerun `rank()` on
					     every keystroke in files mode.

					     The scroller is the inner `<div>`: `flex` on the panel itself would
					     override Tailwind's `[hidden]` rule and show the hidden panel. -->
					<Tabs.Content value="problems" class="min-h-0">
						<div bind:this={problemsPanelEl} class="flex h-full flex-col overflow-y-auto">
							{#if !inFiles}
								{#if indexLoading}
									<div class="m-auto">
										<p class="text-center text-sm text-muted-foreground">Loading search index…</p>
									</div>
								{:else if indexFailed}
									<!-- `boxed={false}` throughout: the dialog already has edges. -->
									<EmptyState
										boxed={false}
										variant="error"
										icon={TriangleAlert}
										message="Couldn't load the search index"
										hint="Close this and reopen it to try again."
										class="m-auto"
									/>
								{:else if !query.trim() && !filtering}
									<div class="m-auto flex flex-col gap-2 px-5">
										<p class="text-center text-sm text-muted-foreground">
											Type to search for problems across all olympiads…
										</p>
										<p class="text-center text-sm text-muted-foreground">
											Search in the order: olympiad name, year, and problem title
										</p>
										{#if signedIn && progressLoading}
											<p class="text-center text-xs text-muted-foreground">
												Loading your progress…
											</p>
										{/if}
									</div>
								{:else if results.length === 0}
									<EmptyState
										boxed={false}
										icon={SearchX}
										message="No results found"
										class="m-auto"
									>
										<!-- A forgotten filter is the usual cause of "No results found". -->
										{#snippet action()}
											{#if filtering || olympiadFilter !== null}
												<Button variant="outline" size="sm" onclick={clearFilters}
													>Clear filters</Button
												>
											{/if}
										{/snippet}
									</EmptyState>
								{:else}
									{#if filtering || olympiadFilter !== null}
										<!-- Also shown for an olympiad filter set in files mode, which is
										     otherwise invisible here. Mirrors the note in the files panel. -->
										<div
											class="flex items-center justify-between gap-2 border-b glass-hairline px-4 py-2 text-xs text-muted-foreground"
										>
											<span>
												{#if filtering}
													{plural(filteredIndex.length, 'problem matches', 'problems match')} your filters
												{/if}
												{#if olympiadFilter !== null}
													<span class="block">
														The {filteredOlympiadName ?? 'olympiad'} filter applies to file search only.
													</span>
												{/if}
											</span>
											<Button variant="ghost" size="sm" class="h-6 px-2" onclick={clearFilters}>
												Clear filters
											</Button>
										</div>
									{/if}
									<ul>
										{#each results as item, i (item.olympiadId + item.year + item.problem.number)}
											<SearchResultItem
												{item}
												{query}
												index={i}
												focused={i === focused}
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
							{/if}
						</div>
					</Tabs.Content>

					<Tabs.Content value="files" class="min-h-0">
						<div bind:this={filesPanelEl} class="flex h-full flex-col overflow-y-auto">
							{#if inFiles}
								{#if deepTooLong}
									<!-- Before `deepFailed`: this query is never sent, so it must win over
									     markers left by one that was. -->
									<div class="m-auto flex flex-col gap-2 px-5">
										<p class="text-center text-sm text-muted-foreground">
											That's too long to search inside files.
										</p>
										<p class="text-center text-xs text-muted-foreground">
											{deepQuery.length} characters — the limit is {MAX_DEEP_QUERY_LENGTH}.
										</p>
									</div>
								{:else if deepFailed}
									<EmptyState
										boxed={false}
										variant="error"
										icon={TriangleAlert}
										message="Couldn't search inside files"
										class="m-auto"
									>
										{#snippet action()}
											<Button variant="outline" size="sm" onclick={() => deep.retry()}
												>Try again</Button
											>
										{/snippet}
									</EmptyState>
								{:else if deepQuery.length < MIN_DEEP_QUERY_LENGTH}
									<div class="m-auto flex flex-col gap-2 px-5">
										<p class="text-center text-sm text-muted-foreground">
											Search the text inside every uploaded document.
										</p>
										{#if deepTooShort}
											<p class="text-center text-xs text-muted-foreground">
												Type at least {MIN_DEEP_QUERY_LENGTH} characters.
											</p>
										{/if}
									</div>
								{:else if visibleDeepResults.length === 0 && deepLoading}
									<div class="m-auto">
										<p class="text-center text-sm text-muted-foreground">Searching inside files…</p>
									</div>
								{:else if visibleDeepResults.length === 0}
									<!-- `indexEmpty` is global even under a filter, so the client names the
									     filtered olympiad itself. -->
									<EmptyState
										boxed={false}
										icon={SearchX}
										class="m-auto"
										message={deep.indexEmpty
											? 'No files indexed yet'
											: filteredOlympiadName !== null
												? `No ${filteredOlympiadName} files contain that phrase`
												: 'No files contain that phrase'}
										hint={deep.indexEmpty ? 'The archive is still catching up.' : undefined}
									/>
								{:else}
									{#if filtering}
										<!-- Says which problem filters stopped applying. -->
										<p class="border-b glass-hairline px-4 py-2 text-xs text-muted-foreground">
											Topic and progress filters don't apply to files — one file can cover a whole
											year.
										</p>
									{/if}
									<!-- A newer in-flight query dims the last list instead of emptying it. -->
									<ul
										class={cn(
											'transition-opacity duration-150 motion-reduce:transition-none',
											deepStale || deepLoading ? 'opacity-60' : 'opacity-100'
										)}
									>
										{#each visibleDeepResults as hit, i (hit.file.url)}
											<FileResultItem
												{hit}
												index={i}
												focused={i === focused}
												onhover={() => (focusedIndex = i)}
											/>
										{/each}
									</ul>
									{#if deep.truncated}
										<p class="py-2 text-center text-xs text-muted-foreground">
											Showing the {DEEP_SEARCH_LIMIT} best-matching files — refine your search to narrow
											down.
										</p>
									{/if}
								{/if}
							{/if}
						</div>
					</Tabs.Content>
				</Tabs.Root>

				<SearchHints {mode} />
			</Dialog.Content>
		</div>
	</Dialog.Portal>
</Dialog.Root>
