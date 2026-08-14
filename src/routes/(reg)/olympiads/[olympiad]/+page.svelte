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
	import YearPanel from './YearPanel.svelte';
	import { filterYears, hasProblemMatches, showYearLevel, type FilterState } from './filter';

	let { data }: PageProps = $props();

	const olympiad = $derived(data.olympiad);

	let years: YearEntry[] | null = $state(null);
	let loading = $state(true);
	let loadFailed = $state(false);

	let query = $state('');
	let showFullYear = $state(false);
	/** Topics the user is filtering by. Empty means no topic filter. */
	let activeTopics = $state<ProblemTopic[]>([]);

	/**
	 * The years, problems and files come from `/api/olympiads/[olympiad]` rather
	 * than from the page load, so the response is served out of Cloudflare's
	 * shared cache instead of costing a D1 read per visit.
	 */
	$effect(() => {
		const id = olympiad.id; // tracked dependency: refetch when navigating between olympiads
		years = null;
		loading = true;
		loadFailed = false;
		query = '';
		activeTopics = [];

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

	const filterState = $derived<FilterState>({ query, topics: activeTopics, showFullYear });
	const filtered = $derived.by(() => filterYears(years, filterState));
	const canShowFullYear = $derived.by(() => hasProblemMatches(years, filterState));
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
			{#snippet filters()}
				{#if canShowFullYear}
					<label class="flex cursor-pointer items-center gap-2">
						<Switch bind:checked={showFullYear} />
						<span class="text-sm text-nowrap text-muted-foreground">Show full year</span>
					</label>
				{/if}
				<!-- Topics are never shown on a problem — that would spoil it — but they can
				     still be used to narrow the list down. -->
				<TopicSelect
					bind:value={activeTopics}
					label="All topics"
					heading="Filter by topic"
					align="end"
					class="shrink-0"
				/>
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
				<YearPanel {year} showYearLevel={showYearLevel(year, filterState)} />
			{/each}
		</div>
	{:else}
		<SearchEmptyState
			message="No results found"
			hint="Try a different year or problem name, or clear the topic filter."
			clearLabel="Clear filters"
			onClear={() => {
				query = '';
				activeTopics = [];
			}}
		/>
	{/if}
</section>
