<script lang="ts">
	import type { PageProps } from './$types';
	import { Pending } from '$lib/forms.svelte';
	import Title from '$lib/components/Title.svelte';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import SvelteSeo from 'svelte-seo';
	import SelectYearForm from './SelectYearForm.svelte';
	import NewOlympiadForm from './NewOlympiadForm.svelte';

	let { data, form }: PageProps = $props();

	let tab = $state('existing');

	/**
	 * In-flight submissions, keyed by action.
	 *
	 * One instance for the whole page, passed down: `has()` has to read the same
	 * map that `track()` writes, so a per-component instance would leave the
	 * buttons permanently enabled.
	 */
	const pending = new Pending();
</script>

<SvelteSeo title="Contribute" description="Edit anything" />

<Title
	title="Contribute"
	description="This is Houston. Right here, you can edit almost every piece of content on the olympiads page. Note that due to caching, your changes may only be reflected on the corresponding olympiad pages after a day or so. Reloading will not expedite it — the delay is in Cloudflare's shared cache, which only an admin can purge early."
/>

<Tabs.Root class="mx-auto max-w-xl gap-5" bind:value={tab}>
	<Tabs.List variant="default">
		<Tabs.Trigger value="existing">Existing olympiad</Tabs.Trigger>
		<Tabs.Trigger value="new">New olympiad</Tabs.Trigger>
	</Tabs.List>

	<Tabs.Content value="existing">
		<SelectYearForm olympiads={data.olympiads} {form} {pending} />
	</Tabs.Content>

	<Tabs.Content value="new">
		<NewOlympiadForm {form} {pending} />
	</Tabs.Content>
</Tabs.Root>
