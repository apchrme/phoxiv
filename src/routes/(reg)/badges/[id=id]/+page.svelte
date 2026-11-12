<script lang="ts">
	import SvelteSeo from 'svelte-seo';
	import { resolve } from '$app/paths';
	import BackLink from '#lib/components/BackLink.svelte';
	import BadgeDetail from './BadgeDetail.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<SvelteSeo
	title="{data.badge.name} — Badges — phoXiv"
	description={data.badge.description || `The ${data.badge.name} badge on phoXiv.`}
/>

<BackLink href={resolve('badges')}>All badges</BackLink>

<!-- Keyed, so moving to another badge's page starts its fetches afresh. -->
{#key data.badge.id}
	<BadgeDetail badge={data.badge} signedIn={!!data.user} />
{/key}
