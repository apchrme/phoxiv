<script lang="ts">
	import type { PageProps } from './$types';
	import type { ProblemTopic, YearEntry } from '$lib/types.js';
	import SearchBar from '$lib/components/search/SearchBar.svelte';
	import TopicSelect from '$lib/components/TopicSelect.svelte';
	import SearchEmptyState from '$lib/components/search/SearchEmptyState.svelte';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import BackLink from '$lib/components/BackLink.svelte';
	import SvelteSeo from 'svelte-seo';
	import { tick } from 'svelte';
	import { resolve } from '$app/paths';
	import Skeleton from '$lib/components/ui/skeleton/skeleton.svelte';
	import { formToasts, Pending } from '$lib/forms.svelte';
	import type { ProgressMap } from '$lib/progress';
	import YearPanel from './YearPanel.svelte';
	import StatusFilter from './StatusFilter.svelte';
	import {
		filterYears,
		hasProblemMatches,
		showYearLevel,
		type FilterState,
		type ProblemStatus
	} from './filter';

	let { data, form }: PageProps = $props();

	const olympiad = $derived(data.olympiad);
	/** Layout data is merged into page data, so `user` is reachable from here. */
	const signedIn = $derived(!!data.user);

	let years: YearEntry[] | null = $state(null);
	let loading = $state(true);
	let loadFailed = $state(false);

	let query = $state('');
	let showFullYear = $state(false);
	/** Topics the user is filtering by. Empty means no topic filter. */
	let activeTopics = $state<ProblemTopic[]>([]);
	/**
	 * Completion state the user is filtering by. Signed-in only — the control is
	 * not rendered for anonymous visitors, for whom "Done" could only ever be
	 * empty.
	 */
	let status = $state<ProblemStatus>('all');

	/**
	 * The problems the signed-in user has tracked, keyed by `progressKey`. Empty
	 * for anonymous visitors, who see no tracking UI at all.
	 *
	 * Only their scores: each problem's maximum arrives with the problem itself in
	 * `years` below, because it is public and the same for every visitor.
	 */
	let progress = $state<ProgressMap>({});

	/** In-flight submissions, one entry per problem — see `ProgressControl`. */
	const pending = new Pending();

	/**
	 * The years, problems and files come from `/api/olympiads/[olympiad]` rather
	 * than from the page load, so the response is served out of Cloudflare's
	 * shared cache instead of costing a D1 read per visit.
	 *
	 * Plain `fetch`. `max-age=0, must-revalidate` means the browser revalidates
	 * before reusing anything it stored, so Cloudflare's shared cache is the only
	 * place this can go stale — see `$lib/server/cache.ts` for how long, and why
	 * that is accepted.
	 */
	$effect(() => {
		const id = olympiad.id; // tracked dependency: refetch when navigating between olympiads
		years = null;
		loading = true;
		loadFailed = false;
		query = '';
		activeTopics = [];
		status = 'all';

		fetch(`/api/olympiads/${id}`)
			.then((r) => {
				if (!r.ok) throw new Error(`HTTP ${r.status}`);
				return r.json() as Promise<YearEntry[]>;
			})
			.then(async (fetched) => {
				years = fetched;
				loading = false;

				// Honour a #<year> deep link once the panels actually exist.
				const hash = window.location.hash;
				if (hash) {
					await tick();
					document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' });
				}
			})
			.catch(() => {
				loading = false;
				loadFailed = true;
			});
	});

	/**
	 * Progress, fetched separately from the years above.
	 *
	 * A second effect rather than a branch of the first, because the dependencies
	 * genuinely differ: this one tracks the signed-in user as well as the
	 * olympiad, so signing in or out refetches — and it must not drag the years
	 * fetch along with it when that happens.
	 *
	 * The endpoint sits outside `/api/` and answers `private, no-store`; a page
	 * load could not have carried this, because `(reg)/+layout.server.ts` has
	 * already set a four-hour private cache header and SvelteKit refuses to set
	 * the same header twice.
	 */
	$effect(() => {
		const id = olympiad.id;
		const userId = data.user?.id;
		progress = {};
		if (!userId) return;

		fetch(`/olympiads/${id}/progress`)
			.then((r) => {
				if (!r.ok) throw new Error(`HTTP ${r.status}`);
				return r.json() as Promise<ProgressMap>;
			})
			.then((fetched) => {
				// Discard a response the user has already navigated away from. (The
				// years fetch above has no such guard — a slow first response can
				// still overwrite a faster second one. Pre-existing, and left alone
				// here rather than fixed in passing.)
				if (olympiad.id !== id) return;
				progress = fetched;
			})
			.catch(() => {
				// Tracking is an enhancement: a failure here leaves every problem
				// looking untracked rather than breaking the page.
			});
	});

	// Failures toast automatically. There is deliberately no `trackProblem` entry
	// in the success map: a successful click is silent, and the icon changing
	// state is the feedback.
	formToasts(() => form);

	/**
	 * Merges the action's canonical entry back into the map.
	 *
	 * `form` is a discriminated union — first on `success`, then on `action` — so
	 * `form.key` and `form.entry` narrow without any `'x' in form` probing. This
	 * is why the merge lives here rather than in a `formToasts` handler, which
	 * only sees the loosely typed envelope.
	 *
	 * A removal **deletes** the key instead of writing a tombstone: an absent key
	 * is the only spelling of "untracked", and a second spelling would have to be
	 * checked for everywhere the map is read. Svelte 5's `$state` proxy traps
	 * `deleteProperty`, so the delete is as reactive as the assignment.
	 */
	$effect(() => {
		if (!(form?.success && form.action === 'trackProblem')) return;
		if (form.entry === null) delete progress[form.key];
		else progress[form.key] = form.entry;
	});

	const filterState = $derived<FilterState>({ query, topics: activeTopics, status, showFullYear });
	/**
	 * `progress` is an *input* to the filter, not just to the cards, so a problem
	 * that stops matching leaves the list the moment its state changes: under "To
	 * do" the page reads as a to-do list that empties as you work. The card
	 * unmounting takes the portalled popover with it, which is the intended
	 * feedback rather than a bug.
	 *
	 * It costs nothing while no problem-level filter is active — `filter.ts`
	 * returns early before ever reading the map, so this doesn't re-derive on
	 * every tracking click.
	 */
	const filtered = $derived.by(() => filterYears(years, filterState, progress));
	const canShowFullYear = $derived.by(() => hasProblemMatches(years, filterState, progress));
</script>

<SvelteSeo
	title="{olympiad.name} — phoXiv"
	description="An archive of problems and solutions from the {olympiad.name}, in PDF format."
	keywords="problems, solutions, olympiad, physics"
/>

<BackLink href={resolve('/olympiads')}>Back to olympiads</BackLink>

<header class="flex flex-col gap-3 pt-3 md:pt-5">
	<h1 class="text-3xl leading-tight font-bold tracking-tight sm:text-4xl">{olympiad.name}</h1>
	{#if olympiad?.descriptionHtml}
		<div class="prose mb-4 max-w-none">
			<!-- Sanitised server-side by $lib/server/markdown.ts before it is ever stored. -->
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			{@html olympiad.descriptionHtml}
		</div>
	{/if}
</header>

<section class="py-4">
	<div class="mb-5">
		<SearchBar placeholder="Search by year or problem…" bind:value={query}>
			{#snippet trailing()}
				<!-- Topics are never shown on a problem — that would spoil it — but they can
				     still be used to narrow the list down. Icon-only so that sharing the
				     input's row on a phone doesn't cost the input a topic name's width. -->
				<TopicSelect
					bind:value={activeTopics}
					label="All topics"
					heading="Filter by topic"
					align="end"
					iconOnly
					class="shrink-0"
				/>
				{#if signedIn}
					<!-- Anonymous visitors have no progress, so "Done" could only ever be
							empty for them — the disabled circle on each problem is what tells
							them tracking exists. -->
					<StatusFilter bind:value={status} />
				{/if}
			{/snippet}
			{#snippet filters()}
				<!-- Both controls in one wrapper so they travel together when the row
				     wraps onto its own line on a phone. -->
				<div class="flex flex-wrap items-center justify-center gap-3">
					{#if canShowFullYear}
						<label class="flex cursor-pointer items-center gap-2">
							<Switch bind:checked={showFullYear} />
							<span class="text-sm text-nowrap text-muted-foreground">Show full year</span>
						</label>
					{/if}
				</div>
			{/snippet}
		</SearchBar>
	</div>

	{#if loading}
		<div class="flex flex-col gap-4">
			{#each { length: 4 }, i (i)}
				<Skeleton class="h-50 w-full" />
			{/each}
		</div>
	{:else if loadFailed}
		<SearchEmptyState
			message="Couldn't load this olympiad"
			hint="Something went wrong fetching the file list. Reloading usually fixes it."
			clearLabel="Reload"
			onClear={() => location.reload()}
		/>
	{:else if filtered.length > 0}
		<div class="flex flex-col gap-4">
			{#each filtered as year (year.year)}
				<YearPanel
					{year}
					showYearLevel={showYearLevel(year, filterState)}
					{progress}
					{pending}
					{signedIn}
				/>
			{/each}
		</div>
	{:else}
		<SearchEmptyState
			message="No results found"
			hint="Try a different year or problem name, or clear the topic and progress filters."
			clearLabel="Clear filters"
			onClear={() => {
				query = '';
				activeTopics = [];
				status = 'all';
			}}
		/>
	{/if}
</section>
