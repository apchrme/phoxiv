<script lang="ts">
	import Badge from '$lib/components/ui/badge/badge.svelte';
	const { contestId, yearFiles } = $props();
	const year = $derived(yearFiles.year);
</script>

{#if contestId == 'ipho' && year == 2017}
	<span class="text-xs font-medium text-destructive">Note: most of this year's problems have major issues.</span>
{/if}
{#if contestId == 'ipho' && year == 2020}
	<Badge variant="outline" href="https://i20.mipt.ru/#problems" target="_blank">Solutions</Badge>
{/if}
{#if contestId == 'apho' && year == 2022}
	<Badge variant="outline" href="https://apho2022.github.io" target="_blank">Experimental Simulation</Badge>
{/if}
{#if contestId == 'apho' && year == 2017}
	<Badge variant="outline" href="https://apho2017.mipt.ru/results/" target="_blank">Results</Badge>
{/if}
{#if contestId == 'apho' && year == 2025}
	<span class="text-xs text-muted-foreground">Note: there are two sets of solutions for T3. The handwritten one is the updated one used for the final marking.</span>
{/if}
