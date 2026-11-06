<script lang="ts">
	import SvelteSeo from 'svelte-seo';
	import Dashboard from './Dashboard.svelte';
	import Landing from './Landing.svelte';
	import type { PageProps } from './$types';

	const { data }: PageProps = $props();
</script>

<SvelteSeo
	title="phoXiv"
	description="An archive of problems and solutions from various physics olympiads. Includes IPhO, EuPhO, USAPhO, the Singapore Olympiads, the Hungarian Eötvös competition and more."
	keywords="problems, solutions, olympiad, physics, ipho, apho, eupho, singapore, eotvos"
/>

<!-- One URL, two pages: the load returns `dashboard` only when signed in. -->
{#if data.dashboard && data.user}
	<Dashboard dashboard={data.dashboard} userName={data.user.name} />
{:else}
	<Landing />
{/if}
