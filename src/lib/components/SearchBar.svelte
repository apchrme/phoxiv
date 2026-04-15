<script lang="ts">
	import * as InputGroup from "$lib/components/ui/input-group/index.js";
	import { Search } from '@lucide/svelte';
	import type { Snippet } from 'svelte';

	let {
		value = $bindable(''),
		placeholder = 'Search…',
		filters
	}: {
		value?: string;
		placeholder?: string;
		filters?: Snippet;
	} = $props();
</script>
<div class="flex flex-col items-center gap-4 sm:flex-row">
	<div class="flex grow flex-col gap-6">
	<InputGroup.Root>
		<InputGroup.Input type="search" {placeholder} bind:value/>
		<InputGroup.Addon>
			<Search />
		</InputGroup.Addon>
	</InputGroup.Root>
	</div>
	{#if filters}
		{@render filters()}
	{/if}
</div>
