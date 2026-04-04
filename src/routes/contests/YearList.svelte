<script lang="ts">
	const { contestId }: { contestId: string } = $props();
	import files from '$lib/pregen/files.json';
	import AdditionalYearFiles from './AdditionalYearFiles.svelte';
	import { fileSyntax } from '$lib/pregen/fileSyntax';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import SearchBar from '$lib/components/SearchBar.svelte';
	import SearchEmptyState from '$lib/components/SearchEmptyState.svelte';
	import { Switch } from '$lib/components/ui/switch/index.js';

	const contestFiles = $derived(files[contestId]);

	let query = $state('');
	let showFullYear = $state(false);

	const filtered = $derived(() => {
		const q = query.trim().toLowerCase();
		if (!q) return contestFiles.map((y) => ({ ...y, matchedFiles: y.files ?? [] }));

		const results = [];
		for (const yearEntry of contestFiles) {
			const yearMatches = String(yearEntry.year).includes(q);
			const matchedProblems = (yearEntry.files ?? []).filter(
				(p) => p.title?.toLowerCase().includes(q) || p.number?.toLowerCase().includes(q)
			);

			if (yearMatches) {
				results.push({ ...yearEntry, matchedFiles: yearEntry.files ?? [] });
			} else if (matchedProblems.length > 0) {
				// Show full year files if toggle is on, otherwise only matched problems
				results.push({
					...yearEntry,
					matchedFiles: showFullYear ? (yearEntry.files ?? []) : matchedProblems
				});
			}
		}
		return results;
	});

	// Whether the current query has any problem-level matches (not just year matches)
	const hasProblemMatches = $derived(() => {
		const q = query.trim().toLowerCase();
		if (!q) return false;
		return contestFiles.some(
			(y) =>
				!String(y.year).includes(q) &&
				(y.files ?? []).some(
					(p) => p.title?.toLowerCase().includes(q) || p.number?.toLowerCase().includes(q)
				)
		);
	});
</script>

<section class="py-4">
	<div class="mb-4">
		<SearchBar placeholder="Search by year or problem…" bind:value={query}>
			{#snippet filters()}
				{#if hasProblemMatches()}
					<label class="flex cursor-pointer items-center gap-2">
						<Switch bind:checked={showFullYear} />
						<span class="text-xs font-medium text-muted-foreground">Show full year</span>
					</label>
				{/if}
			{/snippet}
		</SearchBar>
	</div>

	{#if filtered().length > 0}
		{#each filtered() as yearEntry (yearEntry.year)}
			<Separator />
			<div class="flex flex-col items-center py-4 sm:flex-row">
				<h3 class="shrink-0 px-4 py-0 text-center sm:mb-0 sm:basis-[80pt]">{yearEntry.year}</h3>

				<div class="flex w-full flex-auto flex-col">
					<!-- General files — shown when: no query, year matched, or "show full year" is on -->
					{#if !query.trim() || String(yearEntry.year).includes(query.trim().toLowerCase()) || showFullYear}
						<div class="flex flex-row flex-wrap justify-evenly gap-x-10 gap-y-1 sm:m-0">
							<AdditionalYearFiles {contestId} yearFiles={yearEntry} />
							{#each fileSyntax as fileType (fileType.id)}
								{#if yearEntry[fileType.id] != undefined}
									<a href={yearEntry[fileType.id]} class="text-center" target="_blank"
										>{fileType.display}</a
									>
								{/if}
							{/each}
						</div>
					{/if}

					<!-- Problem-specific files -->
					{#if yearEntry.matchedFiles && yearEntry.matchedFiles.length > 0}
						<div class="flex flex-row flex-wrap justify-evenly gap-3 py-2 xs:gap-5 xs:py-3">
							{#each yearEntry.matchedFiles as problem (problem.number)}
								<div
									class="flex flex-auto flex-col items-center rounded-xl bg-card p-4 xs:p-5"
								>
									<p class="text-center font-medium">{problem.number}: {problem.title}</p>
									<div class="flex flex-row flex-wrap justify-around gap-x-6 gap-y-1">
										{#each fileSyntax as fileType (fileType.id)}
											{#if problem[fileType.id] != undefined}
												<a href={problem[fileType.id]} target="_blank">{fileType.display}</a>
											{/if}
										{/each}
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		{/each}
	{:else}
		<SearchEmptyState
			message="No results found"
			hint="Try a different year or problem name."
			onClear={() => { query = ''; }}
		/>
	{/if}
</section>
