<script lang="ts">
	import XIcon from '@lucide/svelte/icons/x';
	import SearchIcon from '@lucide/svelte/icons/search';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import Skeleton from '#lib/components/ui/skeleton/skeleton.svelte';
	import EmptyState from '#lib/components/EmptyState.svelte';
	import OlympiadPicker from '#lib/components/OlympiadPicker.svelte';
	import TopicSelect from '#lib/components/TopicSelect.svelte';
	import { matchesTopics } from '#lib/filters.js';
	import { rank } from '#lib/utils/fuzzy.js';
	import { plural } from '#lib/utils/plural.js';
	import type { Resource } from '#lib/resource.svelte.js';
	import type { OlympiadOption, ProblemTopic, SearchItem } from '#lib/types.js';
	import type { PageData } from './$types';

	type Picked = PageData['manualProblems'][number];

	/**
	 * Chooses a manual badge's problems from the whole corpus (`/api/search`,
	 * already shared-cached for the ⌘K dialog), so no new endpoint is needed.
	 * Narrow by text, topic and olympiad, then tick rows one at a time or "Add
	 * all" to bulk-assign everything matching.
	 *
	 * Problems are addressed as (olympiad, year, number) and submitted as JSON in
	 * one hidden input; the server resolves them to ids. `problems.id` never
	 * reaches the browser.
	 */
	let {
		corpus,
		olympiads,
		selected = $bindable()
	}: {
		/** The page's `/api/search` resource, shared with the filter preview. */
		corpus: Resource<SearchItem[]>;
		olympiads: OlympiadOption[];
		/** The chosen problems, in the order they were added. */
		selected: Picked[];
	} = $props();

	/** Rows rendered at once; "Add all" still takes every match. */
	const SHOWN = 100;

	let query = $state('');
	let topics = $state<ProblemTopic[]>([]);
	let olympiadIds = $state<string[]>([]);

	const keyOf = (p: { olympiadId: string; year: number; number: string }) =>
		`${p.olympiadId}\u0000${p.year}\u0000${p.number}`;

	const selectedKeys = $derived(new Set(selected.map(keyOf)));

	const pool = $derived(
		(corpus.value ?? []).filter(
			(item) =>
				(olympiadIds.length === 0 || olympiadIds.includes(item.olympiadId)) &&
				matchesTopics(item.problem.topics, topics)
		)
	);
	/** Every match: the whole filtered pool, or its fuzzy-ranked hits. */
	const matches = $derived(
		query.trim()
			? rank(
					pool,
					pool.map((i) => i.searchText),
					query,
					pool.length
				)
			: pool
	);
	const unpicked = $derived(matches.filter((i) => !selectedKeys.has(keyOf(toPicked(i)))));

	function toPicked(item: SearchItem): Picked {
		return {
			olympiadId: item.olympiadId,
			olympiadName: item.olympiadName,
			year: item.year,
			number: item.problem.number,
			title: item.problem.title ?? null
		};
	}

	function toggle(item: SearchItem, checked: boolean) {
		const picked = toPicked(item);
		const key = keyOf(picked);
		selected = checked ? [...selected, picked] : selected.filter((p) => keyOf(p) !== key);
	}

	function addAll() {
		selected = [...selected, ...unpicked.map(toPicked)];
	}

	function remove(p: Picked) {
		const key = keyOf(p);
		selected = selected.filter((s) => keyOf(s) !== key);
	}

	function label(p: Picked): string {
		return `${p.olympiadName} ${p.year} · ${p.number}${p.title ? ` · ${p.title}` : ''}`;
	}

	/** What the server needs, and nothing else. */
	const submitted = $derived(
		JSON.stringify(selected.map(({ olympiadId, year, number }) => ({ olympiadId, year, number })))
	);
</script>

<input type="hidden" name="problems" value={submitted} />

<div class="flex flex-col gap-3">
	<div class="flex flex-col gap-2">
		<div class="flex items-center justify-between gap-2">
			<span class="text-sm font-medium">{plural(selected.length, 'problem')} selected</span>
			{#if selected.length > 0}
				<Button variant="ghost" size="sm" onclick={() => (selected = [])}>Clear all</Button>
			{/if}
		</div>
		{#if selected.length > 0}
			<ul aria-label="Selected problems" class="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
				{#each selected as p (keyOf(p))}
					<li
						class="flex items-center gap-1 rounded-md border border-border bg-muted py-0.5 pr-0.5 pl-2 text-xs"
					>
						<span class="max-w-60 truncate">{label(p)}</span>
						<button
							type="button"
							class="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
							aria-label="Remove {label(p)}"
							onclick={() => remove(p)}
						>
							<XIcon class="size-3" />
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</div>

	<div class="flex flex-col gap-2 rounded-lg border border-border p-3">
		<div class="flex flex-col gap-2 sm:flex-row">
			<div class="relative flex-1">
				<SearchIcon
					class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
				/>
				<Input
					type="search"
					aria-label="Search problems"
					placeholder="Search problems…"
					class="pl-8"
					bind:value={query}
				/>
			</div>
			<TopicSelect bind:value={topics} />
			<OlympiadPicker
				multiple
				bind:values={olympiadIds}
				{olympiads}
				placeholder="All olympiads"
				heading="Olympiads"
				class="sm:w-48"
			/>
		</div>

		{#if corpus.loading}
			<div class="flex flex-col gap-1.5">
				{#each { length: 4 }, i (i)}
					<Skeleton class="h-7 w-full" />
				{/each}
			</div>
		{:else if corpus.failed}
			<EmptyState variant="error" message="Couldn't load the problem list" boxed={false} />
		{:else}
			<div class="flex items-center justify-between gap-2">
				<span class="text-xs text-muted-foreground">
					{plural(matches.length, 'problem matches', 'problems match')}
				</span>
				<Button variant="outline" size="sm" disabled={unpicked.length === 0} onclick={addAll}>
					Add all {unpicked.length}
				</Button>
			</div>
			<ul aria-label="Matching problems" class="flex max-h-72 flex-col overflow-y-auto">
				{#each matches.slice(0, SHOWN) as item (keyOf(toPicked(item)))}
					{@const checked = selectedKeys.has(keyOf(toPicked(item)))}
					<li>
						<label
							class="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted"
						>
							<input
								type="checkbox"
								class="size-4 accent-primary"
								{checked}
								onchange={(e) => toggle(item, e.currentTarget.checked)}
							/>
							<span class="truncate">{label(toPicked(item))}</span>
						</label>
					</li>
				{:else}
					<li class="py-2 text-sm text-muted-foreground">No problems match.</li>
				{/each}
			</ul>
			{#if matches.length > SHOWN}
				<span class="text-xs text-muted-foreground">
					Showing {SHOWN} of {matches.length}. Narrow the search, or use "Add all".
				</span>
			{/if}
		{/if}
	</div>
</div>
