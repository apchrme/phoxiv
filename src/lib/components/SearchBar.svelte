<script lang="ts">
	import { Input } from '$lib/components/ui/input/index.js';
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

<div class="flex flex-col gap-3 sm:flex-row items-center">
	<div class="relative flex-1 w-full">
		<svg
			class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			aria-hidden="true"
		>
			<circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
		</svg>
		<Input type="search" {placeholder} bind:value class="pl-9" />
	</div>

	{#if filters}
		{@render filters()}
	{/if}
</div>
