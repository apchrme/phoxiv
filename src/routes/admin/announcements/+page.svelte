<script lang="ts">
	import type { PageProps } from './$types';
	import SvelteSeo from 'svelte-seo';
	import { resolve } from '$app/paths';
	import BackLink from '#lib/components/BackLink.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import AnnouncementsTable from './AnnouncementsTable.svelte';

	let { data }: PageProps = $props();
</script>

<SvelteSeo title="Announcements — Admin — phoXiv" description="phoXiv admin panel" />

<BackLink href={resolve('admin')}>Back to admin</BackLink>

<PageHeader
	title="Announcements"
	description="News shown in everyone's notifications bell and on the announcements page."
/>

<AnnouncementsTable announcements={data.announcements} />
