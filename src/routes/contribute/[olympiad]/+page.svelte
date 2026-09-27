<script lang="ts">
	import type { PageProps } from './$types';
	import { resolve } from '$app/paths';
	import SvelteSeo from 'svelte-seo';
	import BackLink from '$lib/components/BackLink.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import OlympiadIcon from '$lib/components/OlympiadIcon.svelte';
	import { formToasts, Pending } from '$lib/forms.svelte';
	import YearsCard from './YearsCard.svelte';
	import IconCard from './IconCard.svelte';
	import OlympiadMetadataForm from './OlympiadMetadataForm.svelte';
	import ImportTitlesCard from './ImportTitlesCard.svelte';

	let { data, form }: PageProps = $props();

	/**
	 * The current icon. Overwritten by the toast handlers below, since the icon
	 * forms don't reload the page. Lives here because the header, icon card and
	 * emoji field all read it; don't re-derive it in any of them.
	 */
	let icon = $derived(data.olympiad.icon);

	/** The single `Pending` for the page, passed down to every card. */
	const pending = new Pending();

	// Both cards have inputs the page resets after a successful action.
	let iconCard: ReturnType<typeof IconCard> | undefined = $state();
	let importCard: ReturnType<typeof ImportTitlesCard> | undefined = $state();

	/** Summary line for a finished CSV import. */
	type ImportStats = {
		created: number;
		filled: number;
		topicsFilled: number;
		maxScoresFilled: number;
		kept: number;
		yearsCreated: number;
		/** Unreadable `max_score` cells, which were ignored. */
		badMaxScores: number;
	};
	function importSummary(s: ImportStats) {
		return (
			`Import complete — ${s.created} created, ${s.filled} titles filled, ` +
			`${s.topicsFilled} topics filled, ${s.maxScoresFilled} max scores filled, ${s.kept} kept` +
			`${s.yearsCreated ? `, ${s.yearsCreated} years added` : ''}` +
			`${s.badMaxScores ? `, ${s.badMaxScores} max scores ignored` : ''}.`
		);
	}

	// The one `formToasts` call for this page.
	formToasts(() => form, {
		updateOlympiad: 'Olympiad updated',
		uploadIcon: (result) => {
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

<PageHeader title={data.olympiad.name} size="sm">
	{#snippet leading()}
		<OlympiadIcon {icon} id={data.olympiad.id} size="lg" />
	{/snippet}
	<p class="m-0 font-mono text-sm text-muted-foreground">{data.olympiad.id}</p>
	<p class="m-0 text-sm text-muted-foreground">
		Edit metadata for this olympiad. Changes will be reflected on the olympiad listing page.
	</p>
</PageHeader>

<div class="mx-auto flex max-w-xl flex-col gap-5">
	<YearsCard olympiadId={data.olympiad.id} years={data.years} {pending} />
	<IconCard bind:this={iconCard} olympiadId={data.olympiad.id} {icon} {pending} />
	<OlympiadMetadataForm olympiad={data.olympiad} bind:icon {pending} />
	<ImportTitlesCard bind:this={importCard} olympiadId={data.olympiad.id} {pending} />
</div>
