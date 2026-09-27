<script lang="ts">
	import type { PageProps } from './$types';
	import { resolve } from '$app/paths';
	import SvelteSeo from 'svelte-seo';
	import BackLink from '$lib/components/BackLink.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { formToasts, Pending } from '$lib/forms.svelte';
	import MetadataTab from './MetadataTab.svelte';
	import FilesTab from './FilesTab.svelte';

	let { data, params, form }: PageProps = $props();

	let phase = $state<'metadata' | 'files'>('metadata');

	/**
	 * The single `Pending` for the page, shared by both tabs. Upload keys are per
	 * section (`'year'`, `'problem:<number>'`), never per typed label: `use:enhance`
	 * captures its callback at mount, so a label-based key would never re-enable.
	 */
	const pending = new Pending();

	// The one `formToasts` call for this page.
	formToasts(() => form, {
		saveMetadata: 'Metadata saved',
		uploadFile: 'File uploaded',
		deleteFile: 'File deleted'
	});
</script>

<SvelteSeo
	title="{params.olympiad} {params.year}"
	description="Modify {params.olympiad} {params.year}"
/>

<BackLink href={resolve(`/contribute/${params.olympiad}`)}>Back to {data.olympiad.name}</BackLink>

<PageHeader title={data.olympiad.name} size="sm">
	{#snippet titleSuffix()}
		<span class="font-mono text-primary">{data.year.year}</span>
	{/snippet}
	<p class="m-0 text-sm text-muted-foreground">
		Editing <code class="rounded bg-muted px-1 py-0.5 font-mono text-xs"
			>{data.olympiad.id}/{data.year.year}</code
		>
	</p>
</PageHeader>

<Tabs.Root bind:value={phase} class="gap-5">
	<Tabs.List>
		<Tabs.Trigger value="metadata">Phase 1 — Metadata</Tabs.Trigger>
		<Tabs.Trigger value="files">Phase 2 — Files</Tabs.Trigger>
	</Tabs.List>

	<!-- bits-ui hides inactive panels without unmounting, so the draft survives tab switches. -->
	<Tabs.Content value="metadata">
		<MetadataTab
			olympiadName={data.olympiad.name}
			year={data.year}
			problems={data.problems}
			{pending}
		/>
	</Tabs.Content>

	<Tabs.Content value="files">
		<FilesTab
			yearFiles={data.yearFiles}
			problems={data.problems}
			fileTextStatus={data.fileTextStatus}
			{pending}
		/>
	</Tabs.Content>
</Tabs.Root>
