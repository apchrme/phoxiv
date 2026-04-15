<script lang="ts">
	import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import { fade } from 'svelte/transition';

	let visible = $state(false);
</script>

<svelte:window
	onscroll={() => {
		visible = window.scrollY > 400;
	}}
/>

{#if visible}
	<button
		transition:fade={{ duration: 150 }}
		onclick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
		class="{buttonVariants({
			variant: 'outline',
			size: 'icon'
		})} fixed right-6 bottom-6 z-50 shadow-md"
		aria-label="Return to top"
	>
		<ArrowUpIcon />
	</button>
{/if}
