<script lang="ts">
	import type { PageProps } from './$types';
	let { params }: PageProps = $props();
	import contests from '$lib/pregen/contests.json';
	import SvelteSeo from 'svelte-seo';
	import DOMPurify from 'isomorphic-dompurify';
	let contest = $derived(contests.find((i) => i.id == params.contest));

	import YearList from './YearList.svelte';
</script>

{#if contest}
	<SvelteSeo
		title={contest.name}
		description="An archive of problems and solutions from the {contest.name}, in PDF format."
		keywords="problems, solutions, olympiad, physics"
	/>

	<h1>{contest.name}</h1>

	{#if contest?.descriptionHtml}
		<div class="mb-4 max-w-none">
			{@html DOMPurify.sanitize(contest.descriptionHtml)}
		</div>
	{/if}

	<YearList contestId={contest.id} />
{:else}{/if}
