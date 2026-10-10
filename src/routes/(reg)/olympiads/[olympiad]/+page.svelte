<script lang="ts">
	import type { PageProps } from './$types';
	import type { ProblemTopic, YearEntry } from '$lib/types.js';
	import SearchBar from '$lib/components/search/SearchBar.svelte';
	import TopicSelect from '$lib/components/TopicSelect.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { SearchX, TriangleAlert } from '@lucide/svelte';
	import BackLink from '$lib/components/BackLink.svelte';
	import SvelteSeo from 'svelte-seo';
	import { tick } from 'svelte';
	import { resolve } from '$app/paths';
	import Skeleton from '$lib/components/ui/skeleton/skeleton.svelte';
	import { formToasts, Pending } from '$lib/forms.svelte';
	import type { ProgressMap } from '$lib/progress';
	import YearPanel from './YearPanel.svelte';
	import StatusFilter from '$lib/components/StatusFilter.svelte';
	import {
		filterYears,
		hasProblemMatches,
		showYearLevel,
		type FilterState,
		type ProblemStatus
	} from './filter';

	let { data, form }: PageProps = $props();

	const olympiad = $derived(data.olympiad);
	const signedIn = $derived(!!data.user);

	let years: YearEntry[] | null = $state(null);
	let loading = $state(true);
	let loadFailed = $state(false);

	let query = $state('');
	let showFullYear = $state(false);
	/** Empty means no topic filter. */
	let activeTopics = $state<ProblemTopic[]>([]);
	/** Signed-in only; anonymous visitors have no progress to filter. */
	let status = $state<ProblemStatus>('all');

	/** The user's scores keyed by `progressKey`. Maximums come with `years`. */
	let progress = $state<ProgressMap>({});

	/**
	 * Keys tracked or removed while the progress fetch was in flight; they win
	 * over the snapshot when it lands. Not a spread merge, because a removal is an
	 * absent key and a spread would bring it back. Not `$state`, or it would
	 * re-run the effect that writes it.
	 */
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- a SvelteSet is exactly what this must not be
	let touched = new Set<string>();

	/** The single `Pending` for this page, passed down to every `ProgressControl`. */
	const pending = new Pending();

	/**
	 * Years, problems and files come from `/api/olympiads/[olympiad]`, not the page
	 * load, so they're served from the shared cache instead of D1. See
	 * docs/architecture.md, "Why some pages fetch their own data".
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
				// The component is reused across olympiads, so drop a response for one
				// the user has navigated away from.
				if (olympiad.id !== id) return;
				years = fetched;
				loading = false;

				// Honour a #<year> deep link once the panels exist.
				const hash = window.location.hash;
				if (hash) {
					await tick();
					// Re-checked: year ids are bare numbers, so a stale scroll would hit a wrong panel.
					if (olympiad.id !== id) return;
					document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' });
				}
			})
			.catch(() => {
				// A stale failure must not show an error over an olympiad that loaded.
				if (olympiad.id !== id) return;
				loading = false;
				loadFailed = true;
			});
	});

	/**
	 * Progress, in its own effect because it also depends on the user: signing in
	 * or out refetches it without refetching the years. The endpoint is outside
	 * `/api/` and `private, no-store`. It can't come from the page load, whose
	 * cache header `(reg)/+layout.server.ts` has already set.
	 */
	$effect(() => {
		const id = olympiad.id;
		const userId = data.user?.id;
		progress = {};
		touched = new Set();
		if (!userId) return;

		fetch(`/olympiads/${id}/progress`)
			.then((r) => {
				if (!r.ok) throw new Error(`HTTP ${r.status}`);
				return r.json() as Promise<ProgressMap>;
			})
			.then((fetched) => {
				if (olympiad.id !== id) return;

				// Re-apply keys changed since the request went out. Don't leave this to
				// the merge effect below: `form` holds only the last result, so two
				// problems tracked meanwhile would come back as one.
				for (const key of touched) {
					const entry = progress[key];
					if (entry === undefined) delete fetched[key];
					else fetched[key] = entry;
				}
				progress = fetched;
			})
			.catch(() => {
				// On failure every problem just looks untracked.
			});
	});

	// The one `formToasts` call for this page. No success toast for
	// `trackProblem`: the icon changing is the feedback.
	formToasts(() => form);

	/**
	 * Merges the action's entry into the map. Lives here, not in a `formToasts`
	 * handler, because `form` is typed here. A removal deletes the key: an absent
	 * key is the only way to say "untracked".
	 */
	$effect(() => {
		if (!(form?.success && form.action === 'trackProblem')) return;
		touched.add(form.key);
		if (form.entry === null) delete progress[form.key];
		else progress[form.key] = form.entry;
	});

	const filterState = $derived<FilterState>({ query, topics: activeTopics, status, showFullYear });
	/**
	 * `progress` feeds the filter, so under "To do" a problem leaves the list as
	 * soon as it's tracked, closing its popover. That is intended.
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

<!-- `md:py-2` too: tailwind-merge only overrides PageHeader's `md:py-8` with a matching modifier. -->
<PageHeader title={olympiad.name} class="py-3 md:py-3">
	{#if olympiad?.descriptionHtml}
		<div class="prose max-w-none">
			<!-- Sanitised server-side by $lib/server/markdown.ts before it is ever stored. -->
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			{@html olympiad.descriptionHtml}
		</div>
	{/if}
</PageHeader>

<section class="py-4">
	<div class="mb-5">
		<SearchBar placeholder="Search by year or problem…" bind:value={query}>
			{#snippet trailing()}
				<!-- Topics are never shown on a problem (spoilers), only used to filter. -->
				<TopicSelect
					bind:value={activeTopics}
					label="All topics"
					heading="Filter by topic"
					align="end"
					iconOnly
					class="shrink-0"
				/>
				{#if signedIn}
					<StatusFilter bind:value={status} />
				{/if}
			{/snippet}
			{#snippet filters()}
				<!-- Keep the `{#if}` outside the element: an empty element here would
				     still take up a flex gap. -->
				{#if canShowFullYear}
					<label class="flex cursor-pointer items-center gap-2">
						<Switch bind:checked={showFullYear} />
						<span class="text-sm text-nowrap text-muted-foreground">Show full year</span>
					</label>
				{/if}
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
		<EmptyState
			variant="error"
			icon={TriangleAlert}
			message="Couldn't load this olympiad"
			hint="Something went wrong fetching the file list. Reloading usually fixes it."
		>
			{#snippet action()}
				<Button variant="outline" size="sm" onclick={() => location.reload()}>Reload</Button>
			{/snippet}
		</EmptyState>
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
		<EmptyState
			icon={SearchX}
			message="No results found"
			hint="Try a different year or problem name, or clear the topic and progress filters."
		>
			{#snippet action()}
				<Button
					variant="outline"
					size="sm"
					onclick={() => {
						query = '';
						activeTopics = [];
						status = 'all';
					}}
				>
					Clear filters
				</Button>
			{/snippet}
		</EmptyState>
	{/if}
</section>
