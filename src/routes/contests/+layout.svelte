<script lang="ts">
	import YearList from './YearList.svelte';
	let { children } = $props();
	import { page } from '$app/state';
	import { contests } from '$lib/pregen/contests';
	import SvelteSeo from 'svelte-seo';
	let contest = $derived(
		contests.find(
			(i) => i.id == page.url.pathname.split('/')[page.url.pathname.split('/').length - 1]
		)
	);
</script>

<SvelteSeo
	title={contest.name}
	description="An archive of problems and solutions from the {contest.name}, in PDF format."
	keywords="problems, solutions, olympiad, physics"
/>

<h1>{contest.name}</h1>

{@render children()}

<YearList contestId={contest.id} />
