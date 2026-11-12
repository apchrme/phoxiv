<!--
	/badges' standing filter: All badges, Earned or Not earned. `StatusFilter`'s
	dropdown (`IconFilterMenu`) with labels about badges rather than problems.
	The page renders it only for signed-in viewers, since it filters on their
	own standing.
-->
<script lang="ts" module>
	/** Which badges to show by the viewer's standing. `'all'` means no filter. */
	export type BadgeStatus = 'all' | 'earned' | 'unearned';
</script>

<script lang="ts">
	import { Award, Circle, CircleCheck } from '@lucide/svelte';
	import IconFilterMenu from '#lib/components/IconFilterMenu.svelte';

	let {
		value = $bindable('all'),
		disabled = false
	}: {
		value?: BadgeStatus;
		/**
		 * Set until the viewer's standing has arrived. Filtering without it would
		 * claim they have earned nothing.
		 */
		disabled?: boolean;
	} = $props();

	/** The check matches the "Earned" line on a card. */
	const OPTIONS = [
		{ value: 'all', label: 'All badges', icon: Award },
		{ value: 'earned', label: 'Earned', icon: CircleCheck },
		{ value: 'unearned', label: 'Not earned', icon: Circle }
	] as const satisfies readonly { value: BadgeStatus; label: string; icon: typeof Circle }[];
</script>

<IconFilterMenu bind:value options={OPTIONS} heading="Filter by standing" {disabled} />
