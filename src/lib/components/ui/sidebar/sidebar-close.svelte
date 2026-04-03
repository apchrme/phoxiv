<script lang="ts">
	import { useSidebar } from './context.svelte.js';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import XIcon from '@lucide/svelte/icons/x';
	import { cn } from '$lib/utils.js';

	let { class: className }: { class?: string } = $props();

	const sidebar = useSidebar();
</script>

<button
	type="button"
	data-slot="sidebar-close"
	onclick={() => sidebar.setOpen(false)}
	class={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'size-8', className)}
	aria-label="Close navigation"
>
	<XIcon class="size-4" />
</button>
