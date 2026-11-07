<script lang="ts">
	import type { PageProps } from './$types';
	import SvelteSeo from 'svelte-seo';
	import { resolve } from '$app/paths';
	import BackLink from '#lib/components/BackLink.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import ActivityLogTable from './ActivityLogTable.svelte';

	let { data }: PageProps = $props();
</script>

<SvelteSeo title="Activity log — Admin — phoXiv" description="phoXiv admin panel" />

<BackLink href={resolve('admin')}>Back to admin</BackLink>

<PageHeader title="Activity log" description="Every contributor and admin edit, newest first." />

<ActivityLogTable log={data.log} hasMore={data.hasMore} />
