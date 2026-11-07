<script lang="ts">
	import type { PageProps } from './$types';
	import SvelteSeo from 'svelte-seo';
	import { resolve } from '$app/paths';
	import BackLink from '#lib/components/BackLink.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import BadgesTable from './BadgesTable.svelte';

	let { data }: PageProps = $props();
</script>

<SvelteSeo title="Badges — Admin — phoXiv" description="phoXiv admin panel" />

<BackLink href={resolve('admin')}>Back to admin</BackLink>

<PageHeader title="Badges" description="Create and edit badges, and see who holds them." />

<BadgesTable badges={data.badges} olympiads={data.olympiads} />
