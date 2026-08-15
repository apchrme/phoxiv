<script lang="ts">
	import type { PageProps } from './$types';
	import { resolve } from '$app/paths';
	import SvelteSeo from 'svelte-seo';
	import BackLink from '$lib/components/BackLink.svelte';
	import OlympiadIcon from '$lib/components/OlympiadIcon.svelte';
	import { formToasts, Pending } from '$lib/forms.svelte';
	import YearsCard from './YearsCard.svelte';
	import IconCard from './IconCard.svelte';
	import OlympiadMetadataForm from './OlympiadMetadataForm.svelte';
	import ImportTitlesCard from './ImportTitlesCard.svelte';

	let { data, form }: PageProps = $props();

	/**
	 * The icon currently in force.
	 *
	 * Derived from the loaded row but deliberately overwritten by the toast
	 * handlers below, so an upload or removal shows immediately instead of
	 * waiting for the load to revalidate. That override is the reason this one
	 * variable stays on the page: the header, the icon card and the emoji field
	 * all read it, and re-deriving it in any of them would throw the override
	 * away on the next render.
	 */
	let icon = $derived(data.olympiad.icon);

	/** In-flight submissions, keyed by the action they belong to. */
	const pending = new Pending();

	// Both cards hold input state the page has to reset once its action succeeds.
	let iconCard: ReturnType<typeof IconCard> | undefined = $state();
	let importCard: ReturnType<typeof ImportTitlesCard> | undefined = $state();

	/** Summary line for a finished CSV import. */
	type ImportStats = {
		created: number;
		filled: number;
		topicsFilled: number;
		kept: number;
		yearsCreated: number;
	};
	function importSummary(s: ImportStats) {
		return (
			`Import complete — ${s.created} created, ${s.filled} titles filled, ` +
			`${s.topicsFilled} topics filled, ${s.kept} kept` +
			`${s.yearsCreated ? `, ${s.yearsCreated} years added` : ''}.`
		);
	}

	formToasts(() => form, {
		updateOlympiad: 'Olympiad updated',
		uploadIcon: (result) => {
			// Reflect the new icon immediately, before the load revalidates.
			if (typeof result.iconUrl === 'string') icon = result.iconUrl;
			iconCard?.clear();
			return 'Icon uploaded';
		},
		removeIcon: () => {
			icon = '';
			iconCard?.clear();
			return 'Icon removed';
		},
		importTitles: (result) => {
			importCard?.clear();
			return importSummary(result.stats as ImportStats);
		}
	});
</script>

<SvelteSeo
	title="Edit {data.olympiad.name} — phoXiv"
	description="Edit olympiad metadata for {data.olympiad.name}"
/>

<BackLink href={resolve('/contribute')}>Back to contribute</BackLink>

<header class="flex flex-col gap-2 py-5">
	<div class="flex items-center gap-3">
		<OlympiadIcon {icon} id={data.olympiad.id} class="h-9 w-auto text-4xl leading-none" />
		<div>
			<h1 class="text-2xl font-bold tracking-tight">{data.olympiad.name}</h1>
			<p class="text-sm text-muted-foreground font-mono">{data.olympiad.id}</p>
		</div>
	</div>
	<p class="text-sm text-muted-foreground">
		Edit metadata for this olympiad. Changes will be reflected on the olympiad listing page.
	</p>
</header>

<div class="mx-auto max-w-xl flex flex-col gap-5">
	<YearsCard olympiadId={data.olympiad.id} years={data.years} {pending} />
	<IconCard bind:this={iconCard} olympiadId={data.olympiad.id} {icon} {pending} />
	<OlympiadMetadataForm olympiad={data.olympiad} bind:icon {pending} />
	<ImportTitlesCard bind:this={importCard} olympiadId={data.olympiad.id} {pending} />
</div>
