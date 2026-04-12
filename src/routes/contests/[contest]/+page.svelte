<script lang="ts">
	import type { PageProps } from './$types';
	let { params }: PageProps = $props();
	import contests from '$lib/pregen/contests.json';
	import SvelteSeo from 'svelte-seo';
	import YearList from './YearList.svelte';
	let contest = $derived(contests.find((i) => i.id == params.contest));

	// contest will definitely be found, as the page.ts will throw a 404 if it isn't.

</script>

<SvelteSeo
	title={contest.name}
	description="An archive of problems and solutions from the {contest.name}, in PDF format."
	keywords="problems, solutions, olympiad, physics"
/>

<h1>{contest.name}</h1>

{#if contest?.descriptionHtml}
	<div class="mb-4 max-w-none">
		{@html contest.descriptionHtml}
	</div>
{/if}

<YearList contestId={contest.id} />
	
