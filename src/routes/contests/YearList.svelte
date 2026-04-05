<script lang="ts">
	const { contestId }: { contestId: string } = $props();
	import files from '$lib/pregen/files.json';
	import AdditionalYearFiles from './AdditionalYearFiles.svelte';
	import { fileSyntax } from '$lib/pregen/fileSyntax';
	import Badge from '$lib/components/ui/badge/badge.svelte';
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
				results.push({
					...yearEntry,
					matchedFiles: showFullYear ? (yearEntry.files ?? []) : matchedProblems
				});
			}
		}
		return results;
	});

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

	function showYearLevel(yearEntry: (typeof filtered extends () => infer R ? R : never)[number]) {
		const q = query.trim().toLowerCase();
		return !q || String(yearEntry.year).includes(q) || showFullYear;
	}
</script>

<section class="my-4">
	<div class="mb-4">
		<SearchBar placeholder="Search by year or problem…" bind:value={query}>
			{#snippet filters()}
				{#if hasProblemMatches()}
					<label class="flex cursor-pointer items-center gap-2">
						<Switch bind:checked={showFullYear} />
						<span class="text-sm font-medium text-muted-foreground">Show full year</span>
					</label>
				{/if}
			{/snippet}
		</SearchBar>
	</div>

	{#if filtered().length > 0}
		<div class="flex flex-col gap-4">
			{#each filtered() as yearEntry (yearEntry.year)}
				{@const yearLinks = fileSyntax.filter((ft) => yearEntry[ft.id] != undefined)}

				<div class="overflow-hidden rounded-2xl border border-border bg-card">

					<!-- Year header -->
					<div class="flex items-center border-b border-border bg-muted/60 px-4 py-2.5">
						<span class="font-mono text-lg font-semibold tabular-nums text-foreground">
							{yearEntry.year}
						</span>
					</div>

					<div class="flex flex-col gap-4 p-4">

						<!-- Year-level files — always rendered when year is visible, so
						     AdditionalYearFiles can contribute even if yearLinks is empty -->
						{#if showYearLevel(yearEntry)}
							<div class="flex flex-wrap items-center gap-2">
								<AdditionalYearFiles {contestId} yearFiles={yearEntry} />
								{#each yearLinks as fileType (fileType.id)}
									<Badge variant="outline" href={yearEntry[fileType.id]} target="_blank">
										{fileType.display}
									</Badge>
								{/each}
							</div>
						{/if}

						<!-- Problem cards grid -->
						{#if yearEntry.matchedFiles && yearEntry.matchedFiles.length > 0}
							<div class="grid grid-cols-1 gap-3 xs:grid-cols-2 lg:grid-cols-3">
								{#each yearEntry.matchedFiles as problem (problem.number)}
									{@const problemLinks = fileSyntax.filter((ft) => problem[ft.id] != undefined)}
									<div class="flex flex-col gap-3 rounded-xl bg-background p-4">
										<!-- Problem identifier + title -->
										<div class="flex flex-col gap-0.5">
											<span class="font-mono text-sm font-semibold text-primary">
												{problem.number}
											</span>
											{#if problem.title}
												<span class="text-sm font-medium leading-snug text-left text-foreground">
													{problem.title}
												</span>
											{/if}
										</div>
										<!-- File links -->
										{#if problemLinks.length > 0}
											<div class="flex flex-wrap gap-1.5">
												{#each problemLinks as fileType (fileType.id)}
													<Badge
														variant="outline"
														href={problem[fileType.id]}
														target="_blank"
													>
														{fileType.display}
													</Badge>
												{/each}
											</div>
										{/if}
									</div>
								{/each}
							</div>
						{/if}

					</div>
				</div>
			{/each}
		</div>
	{:else}
		<SearchEmptyState
			message="No results found"
			hint="Try a different year or problem name."
			onClear={() => { query = ''; }}
		/>
	{/if}
</section>
