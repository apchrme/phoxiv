<!--
	The olympiad page's display option for problems without files: rows in a
	collapsed list, or a card each like the rest. `IconFilterMenu`'s dropdown,
	unfilled whatever the choice, because it narrows nothing and a fill would
	read as "a filter is on".
-->
<script lang="ts">
	import { LayoutGrid, ListCollapse } from '@lucide/svelte';
	import IconFilterMenu from '#lib/components/IconFilterMenu.svelte';
	import type { ProblemDisplay } from './display';

	let {
		value = $bindable('grouped'),
		class: className
	}: {
		value?: ProblemDisplay;
		class?: string;
	} = $props();

	const OPTIONS = [
		{ value: 'grouped', label: 'Collapsed list', icon: ListCollapse },
		{ value: 'cards', label: 'Cards', icon: LayoutGrid }
	] as const satisfies readonly {
		value: ProblemDisplay;
		label: string;
		icon: typeof LayoutGrid;
	}[];
</script>

<IconFilterMenu
	bind:value
	options={OPTIONS}
	heading="Problems without files"
	caption="Display"
	fill={false}
	class={className}
/>
