<script lang="ts">
	import type { PageProps } from './$types';
	import SvelteSeo from 'svelte-seo';
	import { resolve } from '$app/paths';
	import BackLink from '#lib/components/BackLink.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import { formToasts, Pending } from '#lib/forms.svelte.js';
	import { plural } from '#lib/utils/plural.js';
	import IndexPanel from './IndexPanel.svelte';

	let { data, form }: PageProps = $props();

	/** The single `Pending` for the page, passed down to the panel. */
	const pending = new Pending();

	// The one `formToasts` call, on the component that owns `form`.
	formToasts(() => form, {
		ensureIndex: 'Search index rebuilt',
		optimizeIndex: 'Index segments merged',
		// Names the count the action returns, so a prune that found nothing says so
		// instead of claiming rows were removed (docs/search.md, "Prune orphans").
		pruneIndex: ({ pruned }) =>
			typeof pruned === 'number' && pruned > 0
				? `Removed ${plural(pruned, 'orphaned index row')}`
				: 'No orphaned index rows to remove'
	});
</script>

<SvelteSeo title="Search index — Admin — phoXiv" description="phoXiv admin panel" />

<BackLink href={resolve('admin')}>Back to admin</BackLink>

<PageHeader
	title="Search index"
	description="What full-text search can see, and the maintenance actions for its index."
/>

<IndexPanel stats={data.stats} {pending} />
