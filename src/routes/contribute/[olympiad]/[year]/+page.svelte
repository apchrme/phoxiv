<script lang="ts">
	import type { PageProps } from './$types';
	import { resolve } from '$app/paths';
	import SvelteSeo from 'svelte-seo';
	import BackLink from '$lib/components/BackLink.svelte';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { formToasts, Pending } from '$lib/forms.svelte';
	import MetadataTab from './MetadataTab.svelte';
	import FilesTab from './FilesTab.svelte';

	let { data, params, form }: PageProps = $props();

	let phase = $state<'metadata' | 'files'>('metadata');

	/**
	 * In-flight submissions, shared by both tabs.
	 *
	 * Keys are section-scoped rather than label-scoped: `'metadata'`,
	 * `'deleteYear'`, `'year'` or the problem number for uploads, and
	 * `<section>/<label>` for deletions. A key must not depend on a typed label,
	 * because `use:enhance` captures its callback once when the form mounts — a
	 * label-derived key would be written under the mount-time value and read
	 * under the current one, and the button would never re-enable.
	 */
	const pending = new Pending();

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

<header class="flex flex-col gap-1 py-5">
	<h1 class="text-2xl font-bold tracking-tight">
		{data.olympiad.name}
		<span class="font-mono text-primary">{data.year.year}</span>
	</h1>
	<p class="text-sm text-muted-foreground">
		Editing <code class="rounded bg-muted px-1 py-0.5 font-mono text-xs"
			>{data.olympiad.id}/{data.year.year}</code
		>
	</p>
</header>

<Tabs.Root bind:value={phase} class="gap-5">
	<Tabs.List>
		<Tabs.Trigger value="metadata">Phase 1 — Metadata</Tabs.Trigger>
		<Tabs.Trigger value="files">Phase 2 — Files</Tabs.Trigger>
	</Tabs.List>

	<!-- bits-ui hides the inactive panel rather than unmounting it, which is what
	     lets the metadata draft survive a switch to the files tab and back. -->
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
