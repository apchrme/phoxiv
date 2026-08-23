<script lang="ts">
	import * as InputGroup from '$lib/components/ui/input-group/index.js';
	import { Search } from '@lucide/svelte';
	import type { Snippet } from 'svelte';

	let {
		value = $bindable(''),
		placeholder = 'Search…',
		filters,
		trailing
	}: {
		value?: string;
		placeholder?: string;
		/** Controls that stack below the input on mobile and join its row at `md`. */
		filters?: Snippet;
		/**
		 * Controls pinned to the input's own row at every width. Only for things
		 * that stay narrow whatever their state — anything label-sized belongs in
		 * `filters`, or it squeezes the input on a phone.
		 */
		trailing?: Snippet;
	} = $props();
</script>

<div class="flex flex-col items-center gap-4 md:flex-row">
	<div class="flex w-full items-center gap-2">
		<InputGroup.Root>
			<InputGroup.Input type="search" {placeholder} bind:value />
			<InputGroup.Addon>
				<Search />
			</InputGroup.Addon>
		</InputGroup.Root>
		{#if trailing}
			{@render trailing()}
		{/if}
	</div>
	{#if filters}
		{@render filters()}
	{/if}
</div>
