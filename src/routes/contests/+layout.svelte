<script lang="ts">
	import YearList from '$lib/YearList.svelte';
	let { children } = $props();
	import { page } from '$app/state';
	import { contests } from '$lib/pregen/contests';
	let contest = $derived(
		contests.find(
			(i) => i.id == page.url.pathname.split('/')[page.url.pathname.split('/').length - 1]
		)
	);
</script>

<h1>{contest.name}</h1>

{@render children()}

<YearList contestId={contest.id} />
