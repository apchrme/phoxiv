<script lang="ts">
	import type { ProblemTopic, SearchItem, SearchMode } from '$lib/types.js';
	import { rank, MAX_RESULTS } from '$lib/utils/fuzzy';
	import { Search } from '@lucide/svelte';
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
	import SearchModeToggle from './SearchModeToggle.svelte';
	import { DeepSearch } from './deep-search.svelte';
	import TopicSelect from '$lib/components/TopicSelect.svelte';
	import StatusFilter from '$lib/components/StatusFilter.svelte';
	import { filterSearchItems, isFiltering, type ProblemStatus } from '$lib/filters';
	import type { GlobalProgressMap } from '$lib/progress';
	import type { FileSearchResult } from '$lib/types.js';
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
	 * Everything stateful lives in this shell on purpose. `Dialog.Content` is
	 * wrapped in bits-ui's `{#if shouldRender}`, so its whole subtree unmounts
	 * when the dialog closes — state pushed into a child would be rebuilt on
	 * every open, and the session-long caches below would quietly become a fetch
	 * per keystroke of ⌘K. The `<svelte:window>` handler has to stay out here for
	 * the same reason: it is what *opens* the dialog, so it could never fire from
	 * inside the content.
	 *
	 * # Two modes, one list
	 *
	 * Deep search is a **mode**, not a second panel, so there is only ever one list
	 * on screen: no header rows, no cross-kind index arithmetic. Arrows and Enter
	 * operate over one array; only the count and the activation branch on mode.
	 *
	 * Three network resources, three fetch-once rules: the problem index on first
	 * open, `/progress` on first open when signed in and again when `userId`
	 * changes, and the deep-search cache once per distinct normalised query, ever.
	 */
	let {
		open = $bindable(false),
		userId
	}: {
		open?: boolean;
		/**
		 * The signed-in user's id, or `undefined`. Passed down by `+layout.svelte`
		 * rather than read from `$app/state` here: `data` is a `$props()` read and
		 * so already reactive, and reading `page.data.user` inside a `$lib`
		 * component would couple a shared component to the root layout's load shape
		 * — which cannot even be typed from `$lib`.
		 */
		userId?: string;
	} = $props();

	const signedIn = $derived(userId !== undefined);

	/** One shared empty array, so `visibleDeepResults` keeps referential identity. */
	const NO_HITS: readonly FileSearchResult[] = [];

	// ---------------------------------------------------------------------------
	// Index — fetched once on first open, then cached for the session
	// ---------------------------------------------------------------------------

	/**
	 * `$state.raw`, not `$state`: the array is only ever replaced wholesale, and a
	 * deep proxy over thousands of nested `SearchItem`s would put a `Proxy` trap on
	 * every element read in the filter and the haystack build — both of which run
	 * on a keystroke. It also makes `filterSearchItems`' same-array early return an
	 * exact identity check rather than a proxy-mediated one.
	 */
	let index = $state.raw<SearchItem[]>([]);
	let indexLoading = $state(false);
	let indexFailed = $state(false);
	let indexFetched = false;
	/** Whether a request is out right now. See `fetchIndex` for why it is not `indexLoading`. */
	let indexInFlight = false;

	/**
	 * `indexFetched` is only set on success, so a failed attempt is retried the
	 * next time the dialog opens rather than leaving the session permanently
	 * unsearchable. A plain `let` rather than `$state`: it gates a fetch, it does
	 * not drive markup.
	 *
	 * # Why the guard also consults `indexInFlight`
	 *
	 * Success is not the only thing worth remembering. `indexFetched` is set when
	 * the response lands, so pressing ⌘K three times in quick succession re-ran the
	 * effect below three times before the first response arrived and fired
	 * `/api/search` three times over. **Retry after a failure still works**: both
	 * flags are false again by the time the `finally` has run, so the next open
	 * tries exactly once more, which is the behaviour the paragraph above
	 * describes.
	 *
	 * `indexInFlight` is a plain `let` for a stronger reason than `indexFetched`'s.
	 * This function is called synchronously from an `$effect`, so every `$state` it
	 * reads becomes a dependency of that effect — and `indexLoading` is written by
	 * this very function. Guarding on `indexLoading` would therefore re-run the
	 * effect when the request settles, and on the *failure* path nothing would stop
	 * the next run: `indexFetched` is still false and the flag is false again, so
	 * it would refetch, fail and refetch for as long as the dialog stayed open.
	 * `indexLoading` stays `$state` because the markup reads it; the guard reads
	 * this one.
	 *
	 * The explicit `ok` check matters: an error response with an HTML body makes
	 * `res.json()` throw, which used to escape as an unhandled rejection and left
	 * the dialog claiming "No results found" as though the archive were empty.
	 */
	async function fetchIndex() {
		if (indexFetched || indexInFlight) return;
		indexInFlight = true;
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
			indexInFlight = false;
			indexLoading = false;
		}
	}

	$effect(() => {
		if (open) fetchIndex();
	});

	// ---------------------------------------------------------------------------
	// Progress — the whole archive, so the status filter can span it
	// ---------------------------------------------------------------------------

	/** `$state.raw` for `index`'s reason: replaced wholesale, read per keystroke. */
	let progress = $state.raw<GlobalProgressMap>({});
	/** Drives one hint line, so a "Done" filter chosen before the map lands doesn't read as an empty archive. */
	let progressLoading = $state(false);
	/**
	 * The user whose map is in `progress`. A plain `let` for `indexFetched`'s
	 * reason and one more: the effect below both reads and writes it, so making it
	 * reactive would loop. Precedent: `touched` on the olympiad page.
	 */
	let progressFetchedFor: string | undefined = undefined;
	/**
	 * The user whose map is on the wire right now — `indexInFlight`'s guard, keyed
	 * by user because `progressFetchedFor` is. Three ⌘K presses before the first
	 * response landed used to fire three `/progress` requests, and that endpoint is
	 * `private, no-store` precisely so it is never cached: each one is a real D1
	 * read. Keyed rather than a bare boolean so that a *different* user's map is
	 * still fetched while this one is in flight, which a boolean would have made
	 * wait for the next open.
	 *
	 * Plain, non-reactive, and that is load-bearing here rather than a preference.
	 * `progressLoading` is `$state`, so guarding the effect on it would make the
	 * effect depend on a cell `fetchProgress` writes — and after a failure
	 * `progressFetchedFor` is still unset, so every settled request would schedule
	 * the next one and `/progress` would be hit in a loop for as long as the dialog
	 * stayed open. `progressLoading` stays `$state` because the hint line reads it.
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
			// Tracking is an enhancement, so no toast — the same handling as the
			// olympiad page. `progressFetchedFor` stays unset, so the next open
			// retries rather than leaving the session permanently unfiltered — and
			// clearing the in-flight key below is what keeps that retry possible.
		} finally {
			// Guarded, for `DeepSearch.unschedule`'s reason: a request for a user who
			// has since been superseded must not clear the newer one's key.
			if (progressInFlightFor === id) progressInFlightFor = undefined;
			progressLoading = false;
		}
	}

	$effect(() => {
		const id = userId;
		if (!id) {
			// **Signing out must reset `status` too.** `StatusFilter` is rendered only
			// when signed in, so a user who signs out mid-session would otherwise keep
			// filtering by a control that is no longer on screen — an empty list with
			// nothing on the page explaining why.
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
	let focusedIndex = $state(0);
	let inputEl: HTMLInputElement | undefined = $state();
	let resultsEl: HTMLDivElement | undefined = $state();

	/**
	 * Created once in the shell, so the deep-search cache survives every open and
	 * close. A plain `const` whose *fields* are `$state`.
	 */
	const deep = new DeepSearch();

	/**
	 * `/api/search` gained `problem.topics`, and the old body sits in Cloudflare's
	 * shared cache for up to a day (CLAUDE.md rule 9 — purge it after deploying).
	 * A topic filter over an index without topics matches *nothing at all*, so the
	 * control is hidden rather than left offering a filter that silently empties
	 * the list. True until proven otherwise, so it does not pop in when the fetch
	 * lands.
	 *
	 * **Delete this a day after the purge.** A deploy-window guard, not a feature.
	 */
	const indexHasTopics = $derived(
		index.length === 0 || index.some((i) => i.problem.topics !== undefined)
	);

	const filtering = $derived(isFiltering({ topics: activeTopics, status }));

	/**
	 * Three deriveds, split so each depends on only what it reads: `filteredIndex`
	 * never reads `query`, so typing cannot re-run the topic filter, and the
	 * ranking never reads `progress`, so marking a problem done cannot re-run the
	 * fuzzy match.
	 */
	const filteredIndex = $derived.by(() =>
		filterSearchItems(index, { topics: activeTopics, status }, progress)
	);
	/**
	 * The strings `rank` matches against, indexed in parallel with
	 * `filteredIndex`.
	 *
	 * Derived from the *filtered* array, not from `index` — which is what keeps
	 * the two aligned structurally rather than by convention. `rank` maps a
	 * haystack index straight back to `items[idx]`, so a haystack built from the
	 * unfiltered corpus would return the wrong problems.
	 */
	const filteredHaystack = $derived(filteredIndex.map((i) => i.searchText));

	const results = $derived.by(() => {
		if (indexLoading) return [];
		// **Filtering precedes ranking, and that is a correctness constraint rather
		// than a performance one.** `rank()` caps at MAX_RESULTS, so filtering its
		// *output* would show two "Done" results where forty exist further down the
		// ranking. Do not "simplify" this into a filter over `rank(index, …)`.
		//
		// The second-order effect is worth knowing: with a filter active the corpus
		// `rank` runs over is smaller, so filtering makes the per-keystroke match
		// *faster*. The new layer costs nothing per keystroke.
		if (query.trim()) return rank(filteredIndex, filteredHaystack, query);
		// An empty query with a filter set lists the pool itself, matching the
		// olympiad page — where topic and status always apply and the text query
		// only narrows further. This is the whole cross-archive capability the
		// filters unlock: "every relativity problem I haven't done" cannot be asked
		// by typing, because typing narrows by *text*. It is also why
		// `getSearchIndex` now carries a deterministic top-level order, without
		// which this list would come back in `problems.id` order.
		//
		// `rank()` returns [] for an empty query *by contract*, so this branch
		// deliberately bypasses it rather than bending it.
		return filtering ? filteredIndex.slice(0, MAX_RESULTS) : [];
	});

	// ---------------------------------------------------------------------------
	// Deep search
	// ---------------------------------------------------------------------------

	/**
	 * The key everything deep-search-shaped is keyed on.
	 *
	 * Normalised on the client so `Gravitation`, `gravitation` and `gravitation `
	 * are one Cloudflare cache key, and again on the server so correctness never
	 * depends on the client having done it.
	 */
	const deepQuery = $derived(normalizeDeepQuery(query));
	const deepTooShort = $derived(deepQuery.length > 0 && deepQuery.length < MIN_DEEP_QUERY_LENGTH);
	/**
	 * `deepTooShort`'s mirror at the top end, and a fix for a reported failure
	 * rather than a hypothetical one.
	 *
	 * `MAX_DEEP_QUERY_LENGTH` was enforced only on the server, so pasting a long
	 * passage in — the exact reproduction — got a 400 `{"message":"Search query too
	 * long"}` (confirmed against the live endpoint with a 259-character query). The
	 * panel could render that only as "Couldn't search inside files.", beside a
	 * "Try again" that re-fires the identical query and so **can never succeed**.
	 * Answering it here costs nothing and says what is actually wrong.
	 */
	const deepTooLong = $derived(deepQuery.length > MAX_DEEP_QUERY_LENGTH);

	/**
	 * The debounce **is** the teardown.
	 *
	 * Every dependency change re-runs the effect, and the teardown fires
	 * immediately before the re-run — so `clearTimeout` cancels a request that had
	 * not gone out yet and `abort()` supersedes one that had. No timer state, no
	 * wrapper, and the two compose in three lines.
	 *
	 * The first debounce anywhere in this codebase, and it earns it: problem search
	 * is a local fuzzy match, this one hits the network per keystroke.
	 *
	 * **Every tracked read is synchronous and above the `setTimeout`.** Svelte only
	 * registers dependencies read synchronously in the body, which is exactly what
	 * is wanted here — the fetch itself must create none, or landing a response
	 * would re-trigger the request that produced it. `deep.has()` reads a plain
	 * `Map` for that reason; see the comment on it.
	 *
	 * `deep.schedule()` and `deep.unschedule()` are safe under that same rule for
	 * the opposite reason: they only *write* `DeepSearch`'s cells and read none of
	 * them here, so they add no dependency and cannot re-trigger this effect.
	 */
	$effect(() => {
		if (mode !== 'files') return;
		const key = deepQuery;
		const _attempt = deep.attempt; // tracked: lets "Try again" re-fire the same query
		if (key.length < MIN_DEEP_QUERY_LENGTH) return;
		// The server's upper bound, mirrored so an over-long paste never goes out at
		// all; `deepTooLong` explains what it used to cost. **Deliberately not a
		// truncation to the limit**: the cut would land mid-word, and a deep query's
		// last token is prefix-extended in the `MATCH`, so half a word would become a
		// spurious `hal*` term and quietly change which files came back. Refusing to
		// ask is honest; asking a different question is not.
		if (key.length > MAX_DEEP_QUERY_LENGTH) return;

		// A cache hit is not a network event at all: shown synchronously, so
		// backspacing through a query already run never shows a spinner.
		if (deep.has(key)) {
			deep.show(key);
			return;
		}

		// Pending from *here*, not from inside the timer: the 250 ms a first query
		// spends being typed is time the panel must not spend claiming an answer.
		// See `DeepSearch.schedule`.
		deep.schedule(key);
		const controller = new AbortController();
		const timer = setTimeout(() => void deep.run(key, controller.signal), DEEP_DEBOUNCE_MS);
		return () => {
			clearTimeout(timer);
			controller.abort();
			// Guarded inside `unschedule`, because this teardown runs immediately
			// before the re-run that schedules the *next* key — and on an abort, after
			// it. Clearing unconditionally would blank the newer query's pending state.
			deep.unschedule(key);
		};
	});

	// ---------------------------------------------------------------------------
	// Shared list state
	// ---------------------------------------------------------------------------

	const inFiles = $derived(mode === 'files');

	/**
	 * Non-flickering states are expressed by **branch order, not flags**: too long →
	 * failed → (empty and loading) → genuinely empty → the list. So the loading
	 * state can only appear when there is nothing worth keeping, and a newer query
	 * merely dims the last landed list rather than emptying it.
	 *
	 * `deepLoading` covers the debounce as well as the request itself — see
	 * `DeepSearch.schedule`, which is what stopped the panel announcing "No files
	 * contain that phrase." during the 250 ms before it had asked anything.
	 */
	const deepFailed = $derived(inFiles && deep.hasFailed(deepQuery));
	const deepLoading = $derived(inFiles && deep.isLoading(deepQuery));
	const deepStale = $derived(inFiles && deep.isStale(deepQuery));

	/**
	 * The file rows actually on screen — **not** simply `deep.results`.
	 *
	 * The two diverge in the states that render something else instead: a failure,
	 * and a query outside the length bounds — backspaced below the minimum, or
	 * pasted over the maximum. `deep.results` still holds the last landed list in
	 * all of them (deliberately — that is the cache, and re-typing must not cost a
	 * request), but nothing is rendered from it, so the keyboard must not address
	 * it either. Without this, ArrowDown would move a highlight over rows that are
	 * not there and Enter would open a file the user cannot see.
	 *
	 * The conditions are in the panel's branch order on purpose: the two have to
	 * agree, and the cheapest way to keep them agreeing is to be able to read them
	 * side by side.
	 */
	const visibleDeepResults = $derived(
		deepTooLong || deepFailed || deepQuery.length < MIN_DEEP_QUERY_LENGTH ? NO_HITS : deep.results
	);

	/**
	 * How many rows the keyboard may address. **Derived from what is rendered**, in
	 * both modes, which is the invariant that keeps `focusedIndex` addressable:
	 * every branch that renders no `<ul>` also reports zero here.
	 */
	const resultCount = $derived(inFiles ? visibleDeepResults.length : results.length);

	/**
	 * The row the keyboard is actually on.
	 *
	 * **Clamped on read, never written back**, because the list can shrink *under*
	 * `focusedIndex` between the moment it is set and the moment it is used: hover
	 * row 18 of a stale twenty-row list, let a two-row response land, and Enter did
	 * nothing while ArrowUp needed seventeen presses to reach a real row. The reset
	 * effect below only fires on `query`/`mode`/filter changes, so a *response*
	 * arriving for the query already typed never went through it.
	 *
	 * Clamping by writing `focusedIndex` back from an effect would be a
	 * derived-driven write to state that same derived reads — which is how the
	 * loops this file keeps warning about start. A clamp on read cannot loop, and
	 * it cannot be forgotten by whoever adds the next branch that empties the list.
	 *
	 * Writes still target `focusedIndex` — hover, the arrows, the reset — so an
	 * index parked beyond a briefly-short list is restored, not destroyed, if the
	 * list grows back.
	 */
	const focused = $derived(resultCount === 0 ? 0 : Math.min(focusedIndex, resultCount - 1));

	// Reset the keyboard highlight to the top whenever what is listed changes.
	$effect(() => {
		// `activeTopics.join()` rather than the array by reference, so this does not
		// depend on `TopicSelect` happening to reassign rather than mutate.
		const _deps = [query, mode, status, activeTopics.join()]; // tracked dependencies
		focusedIndex = 0;
	});

	/**
	 * Reset on every open, not just the ones ⌘K drove.
	 *
	 * The dialog can be opened three ways (⌘K, the mobile pill, the desktop nav
	 * button) and closed four (⌘K, Escape, the overlay, the close button), and
	 * only two of those seven went through a function of ours. Before this,
	 * Escape followed by a click on the nav search button reopened the dialog with
	 * the previous query still in it.
	 *
	 * The filters reset too, deliberately unlike the olympiad page: no filter
	 * state lives in any URL in this app and there is no visible chip while the
	 * dialog is shut, so a sticky invisible filter is the likeliest way for this
	 * feature to come back as "search is broken". The **mode** resets for a
	 * stronger reason still — deep search costs a round trip, and ⌘K must never
	 * start out hitting the network.
	 *
	 * It resets what the user asked for and nothing they paid for: all three caches
	 * are untouched, so a reopen still costs no requests. That is the contract
	 * `docs/contributing.md` checks. It assigns these cells but never reads them,
	 * so its only dependency is `open` and there is no loop.
	 */
	$effect(() => {
		if (!open) return;
		query = '';
		mode = 'problems';
		activeTopics = [];
		status = 'all';
		focusedIndex = 0;
		deep.reset();
	});

	// ---------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------

	function clearFilters() {
		activeTopics = [];
		status = 'all';
	}

	function navigateTo(item: SearchItem) {
		goto(resolve(`/olympiads/${item.olympiadId}#${item.year}`));
		open = false;
	}

	/**
	 * Opens whatever the keyboard is on.
	 *
	 * In files mode the row's anchor is deliberately untouched — no
	 * `preventDefault`, no handler — so Enter has no click to delegate to and has
	 * to open the window itself. A keydown is a user activation, so this is not
	 * blocked in practice, and the same-tab fallback covers the case where it is;
	 * silently doing nothing on Enter would be the worst outcome.
	 *
	 * The dialog stays **open** for a file: it opened in a new tab, so coming back
	 * should land on the same result list.
	 */
	function activateFocused() {
		// `focused`, not `focusedIndex`: the row the user can see is the clamped one,
		// and it is the only one Enter may open.
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
	 * Keeps the keyboard-focused row visible.
	 *
	 * Reaches into the DOM rather than holding element references, since the rows
	 * are rendered by a child — but by `[data-result-index]` rather than by
	 * `querySelectorAll('li')[i]`. The scroll container also holds a live region,
	 * a filter summary, the "filters don't apply to files" note and a footer now,
	 * and any future non-result `<li>` would silently shift every index, landing
	 * the highlight on the wrong row. The rows own their index.
	 */
	function scrollFocusedIntoView() {
		// `focused` again: no row carries a `data-result-index` past the last one, so
		// scrolling to an unclamped index would simply find nothing.
		resultsEl
			?.querySelector(`[data-result-index="${focused}"]`)
			?.scrollIntoView({ block: 'nearest' });
	}

	// ---------------------------------------------------------------------------
	// Keyboard handling
	// ---------------------------------------------------------------------------

	function onWindowKeydown(e: KeyboardEvent) {
		const key = e.key.toLowerCase();

		// `.toLowerCase()`: with caps lock on — or shift held — `e.key` is `'K'`,
		// and the plain `=== 'k'` this replaces silently stopped ⌘K working at all.
		if ((e.metaKey || e.ctrlKey) && !e.shiftKey && key === 'k') {
			e.preventDefault();
			open = !open;
			return;
		}
		if (!open) return;

		// ⌘⇧F toggles the mode. Unbound in Chrome, Safari and Firefox — unlike ⌘⇧K,
		// which is Firefox's Web Console — and the toggle button is Tab-reachable,
		// so the chord is a convenience and never the only route.
		if ((e.metaKey || e.ctrlKey) && e.shiftKey && key === 'f') {
			e.preventDefault();
			mode = inFiles ? 'problems' : 'files';
			inputEl?.focus();
			return;
		}

		// Arrows drive the list only while focus is in the input. Without this, an
		// open filter dropdown moves *its* highlight and ours at the same time:
		// `DropdownMenu` and `Dialog` both portal at z-50 and both handlers see the
		// key. Hovering a row does not move focus, so the documented
		// hover-then-Enter contract is unaffected.
		if (e.target !== inputEl) return;

		// While an IME is composing, Enter and the arrows belong to the candidate
		// list, not to us: an unguarded handler activates a result and closes the
		// dialog on the keystroke that was only *committing a word*, and candidate
		// arrows move both highlights at once. This archive's audience is
		// international — Japanese, Chinese and Korean input is a normal way to reach
		// it, not an edge case.
		//
		// **Below the chords, deliberately.** Composition never involves ⌘/Ctrl, so
		// no chord can be part of picking a candidate, and ⌘K in particular is how
		// the dialog is closed again — taking that away mid-composition would trap
		// the user in the very state this guard exists to make usable. Everything an
		// IME genuinely owns is past this line.
		if (e.isComposing) return;

		if (e.key === 'ArrowDown') {
			e.preventDefault();
			// From `focused`, not `focusedIndex`, so a step down from a list that has
			// shrunk starts at the row on screen rather than somewhere past the end.
			// `Math.max(…, 0)`: an empty list gives -1, which parks the index there
			// until an ArrowUp recovers it.
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

				<!-- Input row.
				     `min-w-0` on the input is load-bearing: a flex item's automatic
				     minimum size is its content's, and an `<input>`'s intrinsic width is
				     about twenty characters, so with three controls beside it the row
				     *overflows* instead of the input shrinking — and `Dialog.Content` is
				     `overflow-hidden`, so the visible symptom is a clipped close button.
				     Every control is `icon-sm` (32px) for the same budget: at 390px there
				     are 326px inside the padding, leaving ~154px of input. -->
				<div class="flex items-center gap-2 border-b glass-hairline px-4 py-3">
					{#if deepLoading}
						<!-- The spinner **replaces** the magnifier rather than joining it: the
						     row has no width to spare. -->
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
						<!-- The filters vanish in files mode rather than greying out. A
						     disabled `TopicSelect` keeps the `default` fill it had in problem
						     mode, so it would go on *claiming* a filter is active while it
						     isn't — worse than absent. Nothing is discarded; switching back
						     restores both. -->
						{#if !inFiles}
							{#if indexHasTopics}
								<TopicSelect
									bind:value={activeTopics}
									label="All topics"
									heading="Filter by topic"
									align="end"
									size="icon-sm"
									iconOnly
								/>
							{/if}
							{#if signedIn}
								<!-- Signed-in only, the same rule as the olympiad page: "Done"
								     could only ever be empty without a session. -->
								<StatusFilter bind:value={status} size="icon-sm" />
							{/if}
						{/if}
						<SearchModeToggle bind:mode />
						<Dialog.Close
							class={cn(
								buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
								'border border-white/50 bg-white/30 hover:bg-white/50 dark:border-white/10 dark:bg-white/5'
							)}
							aria-label="Close search"
						>
							<XIcon class="size-4" />
						</Dialog.Close>
					</div>
				</div>

				<!-- Results -->
				<div bind:this={resultsEl} class="flex min-h-0 flex-1 flex-col overflow-y-auto">
					<!-- One coarse live region, carrying a **count only**. A region echoing
					     row contents would read the whole list out again on every keystroke. -->
					<p class="sr-only" role="status" aria-live="polite">
						{resultCount}
						{resultCount === 1 ? 'result' : 'results'}
					</p>

					{#if inFiles}
						{#if deepTooLong}
							<!-- Above `deepFailed` on purpose: this is the one state that is never
							     sent, so it has to win over any marker a query that *was* sent left
							     behind. It renders no `<ul>`, and `visibleDeepResults` is empty on
							     the same condition — the `resultCount` invariant. -->
							<div class="m-auto flex flex-col gap-2 px-5">
								<p class="text-center text-sm text-muted-foreground">
									That's too long to search inside files.
								</p>
								<p class="text-center text-xs text-muted-foreground">
									{deepQuery.length} characters — the limit is {MAX_DEEP_QUERY_LENGTH}.
								</p>
							</div>
						{:else if deepFailed}
							<div class="m-auto flex flex-col items-center gap-2 px-5">
								<p class="text-center text-sm text-destructive">Couldn't search inside files.</p>
								<Button variant="outline" size="sm" onclick={() => deep.retry()}>Try again</Button>
							</div>
						{:else if deepQuery.length < MIN_DEEP_QUERY_LENGTH}
							<div class="m-auto flex flex-col gap-2 px-5">
								<p class="text-center text-sm text-muted-foreground">
									Search the text inside every uploaded document.
								</p>
								<!-- The hints bar is `hidden md:flex`, so the *meaning* of this
								     mode has to live here, where a phone can see it. -->
								<p class="text-center text-sm text-muted-foreground">
									Results are files, not problems — one year's PDF often holds every problem of that
									year.
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
							<p
								class="flex flex-1 items-center justify-center px-5 text-center text-sm text-muted-foreground"
							>
								{deep.indexEmpty
									? 'No files have been indexed yet — this is still catching up.'
									: 'No files contain that phrase.'}
							</p>
						{:else}
							{#if filtering}
								<!-- Shown only while a filter is set, so switching modes is never
								     silent about what stopped applying. -->
								<p class="border-b glass-hairline px-4 py-2 text-xs text-muted-foreground">
									Topic and progress filters don't apply to files — one file can cover a whole year.
								</p>
							{/if}
							<!-- A newer in-flight query dims the last landed list rather than
							     emptying it. That is the whole anti-flicker contract. -->
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
									Showing the {DEEP_SEARCH_LIMIT} best-matching files — refine your search to narrow down.
								</p>
							{/if}
						{/if}
					{:else if indexLoading}
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
					{:else if !query.trim() && !filtering}
						<div class="m-auto flex flex-col gap-2 px-5">
							<p class="text-center text-sm text-muted-foreground">
								Type to search for problems across all olympiads…
							</p>
							<p class="text-center text-sm text-muted-foreground">
								Search in the order: olympiad name, year, and problem title
							</p>
							{#if signedIn && progressLoading}
								<p class="text-center text-xs text-muted-foreground">Loading your progress…</p>
							{/if}
						</div>
					{:else if results.length === 0}
						<div class="m-auto flex flex-col items-center gap-2 px-5">
							<p class="text-center text-sm text-muted-foreground">No results found.</p>
							<!-- A filled funnel is easy to miss, and "No results found" with a
							     forgotten topic filter is the classic trap. -->
							{#if filtering}
								<Button variant="outline" size="sm" onclick={clearFilters}>Clear filters</Button>
							{/if}
						</div>
					{:else}
						{#if filtering}
							<div
								class="flex items-center justify-between gap-2 border-b glass-hairline px-4 py-2 text-xs text-muted-foreground"
							>
								<span>
									{filteredIndex.length}
									{filteredIndex.length === 1 ? 'problem matches' : 'problems match'} your filters
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
				</div>

				<SearchHints {mode} />
			</Dialog.Content>
		</div>
	</Dialog.Portal>
</Dialog.Root>
