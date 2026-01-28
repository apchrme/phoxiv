<script lang="ts">
	const { contestId }: { contestId: string } = $props();
	import files from '../pregen/files.json';
	import YearFiles from '$lib/YearFiles.svelte';
	import { fileSyntax } from '../pregen/fileSyntax';
	import { contests } from '../pregen/contests';
	const contestFiles = files[contestId];
</script>

<section class="py-4">
	<!-- Iterate by year -->
	{#each contestFiles as yearFiles}
		<div
			class="flex flex-col items-center gap-y-2 border-t-2 border-ctp-surface1 py-3 xs:py-4 sm:flex-row"
		>
			<h3 class="shrink-0 px-4 py-0 text-center sm:mb-0 sm:basis-[80pt]">{yearFiles.year}</h3>

			<div class="flex flex-auto flex-col gap-y-3">
				<YearFiles {contestId} {yearFiles} />
				{#if yearFiles.files && yearFiles.files.length != 0}
					<div class="flex flex-row flex-wrap justify-evenly gap-4 xs:gap-5">
						{#each yearFiles.files as problem}
							<div
								class="flex flex-auto basis-xs flex-col items-center rounded-2xl bg-ctp-crust p-4 xs:p-5 dark:bg-ctp-surface0"
							>
								<p class="text-center font-medium">{problem.number}: {problem.title}</p>
								<div class="flex flex-row flex-wrap justify-around gap-x-6 gap-y-1">
									{#each fileSyntax as fileType}
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
