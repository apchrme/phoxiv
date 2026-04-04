<script lang="ts">
	const { contestId, yearFiles } = $props();
	const year = $derived(yearFiles.year);
</script>

<!-- Custom links -->
{#if contestId == 'ipho' && year == 2017}<span class="font-bold">
		Note: most of this year's problems have major issues.
	</span>{/if}
{#if contestId == 'ipho' && year == 2020}
	<a href="https://i20.mipt.ru/#problems" class="text-center" target="_blank">Solutions</a>
{/if}
{#if contestId == 'apho' && year == 2022}
	<a href="https://apho2022.github.io" target="_blank">Experimental Simulation</a>
{/if}
{#if contestId == 'apho' && year == 2017}
	<a href="https://apho2017.mipt.ru/results/" target="-_blank">Results</a>
{/if}
{#if contestId == 'apho' && year == 2025}
	<span
		>Note: there are two sets of solutions for T3. The handwritten one is the updated one used for
		the final marking.</span
	>
{/if}
