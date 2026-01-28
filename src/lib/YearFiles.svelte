<script lang="ts">
	import { fileSyntax } from '../pregen/fileSyntax';
	const { contestId, yearFiles } = $props();
</script>

<div class="flex flex-row flex-wrap justify-evenly gap-x-10 gap-y-1 sm:m-0">
	<!-- Custom links -->
	{#if contestId == 'ipho' && yearFiles.year == 2017}<p class="text-center mb-0 xs:leading-7 font-bold">
			Note: most of this year's problems have major issues.
	</p>{/if}
	{#if contestId == 'ipho' && yearFiles.year == 2020}
		<a href="https://i20.mipt.ru/#problems" class="text-center" target="_blank">Solutions</a>
	{/if}
	{#if contestId == 'apho' && yearFiles.year == 2022}
		<a href="https://apho2022.github.io" target="_blank">Experimental Simulation</a>
	{/if}
	{#if contestId == 'apho' && yearFiles.year == 2017}
		<a href="https://apho2017.mipt.ru/results/" target="-_blank">Results</a>
	{/if}
	{#if contestId == 'ipho' && yearFiles.year == 2000}
		<p>Note: if you see unrendered text in the problem html, try right clicking the link and click "Save Link As". Then open the html file on your computer.</p>
	{/if}
	{#each fileSyntax as fileType}
		{#if yearFiles[fileType.id] != undefined}
			<a href={yearFiles[fileType.id]} class="text-center" target="_blank">{fileType.display}</a>
		{/if}
	{/each}
</div>
