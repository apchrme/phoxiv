<script lang="ts">
	const { contestId }:{contestId: string} = $props();
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
			class="xs:py-4 border-ctp-surface1 flex flex-col items-center border-t-2 py-3 gap-y-2 sm:flex-row"
		>
			<h3 class="px-4 shrink-0 text-center sm:mb-0 sm:basis-[80pt] py-0">{yearFiles.year}</h3>

			<div class="flex-auto flex flex-col gap-y-3">
				<YearFiles {contestId} {yearFiles} />
				{#if yearFiles.files && yearFiles.files.length != 0}
					<div class="flex flex-row flex-wrap justify-evenly gap-4 xs:gap-5">
						{#each yearFiles.files as problem}
							<div
								class="bg-ctp-crust dark:bg-ctp-surface0 flex flex-auto basis-xs flex-col items-center rounded-2xl p-4 xs:p-5"
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
