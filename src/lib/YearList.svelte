<script lang="ts">
	const { contestId }: { contestId: string } = $props();
	import files from '$lib/pregen/files.json';
	import AdditionalYearFiles from '$lib/AdditionalYearFiles.svelte';
	import { fileSyntax } from '$lib/pregen/fileSyntax';
	const contestFiles = $derived(files[contestId]);
</script>

<section class="py-4">
	<!-- Iterate by year -->
	{#each contestFiles as yearFiles (yearFiles.year)}
		<div class="flex flex-col items-center border-t-2 border-ctp-surface1 py-4 sm:flex-row">
			<h3 class="shrink-0 px-4 py-0 text-center sm:mb-0 sm:basis-[80pt]">{yearFiles.year}</h3>

			<div class="flex flex-auto flex-col">
				<!-- General files for that year -->
				<div class="flex flex-row flex-wrap justify-evenly gap-x-10 gap-y-1 sm:m-0">
					<AdditionalYearFiles {contestId} {yearFiles} />
					{#each fileSyntax as fileType (fileType.id)}
						{#if yearFiles[fileType.id] != undefined}
							<a href={yearFiles[fileType.id]} class="text-center" target="_blank"
								>{fileType.display}</a
							>
						{/if}
					{/each}
				</div>

				<!-- Problem-specific files -->
				{#if yearFiles.files && yearFiles.files.length != 0}
					<div class="flex flex-row flex-wrap justify-evenly gap-3 py-2 xs:gap-5 xs:py-3">
						{#each yearFiles.files as problem (problem.number)}
							<div
								class="flex flex-auto basis-xs flex-col items-center rounded-2xl bg-ctp-crust p-3 xs:p-5 dark:bg-ctp-surface0"
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
</section>
