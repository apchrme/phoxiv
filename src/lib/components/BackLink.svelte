<script lang="ts">
	import { ChevronLeft } from '@lucide/svelte';
	import { cn } from '$lib/utils.js';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import type { Snippet } from 'svelte';

	/**
	 * The "back to X" link at the top of detail pages. Takes a resolved `href`:
	 * `resolve()` needs literal route arguments, so it stays at the call site.
	 */
	let {
		href,
		class: className,
		children
	}: { href: string; class?: string; children: Snippet } = $props();
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -- `href` is resolved by the caller -->
<!-- A ghost pill like the app's other secondary actions. The negative margin
     lines the chevron up with the page heading below instead of the pill's edge. -->
<a {href} class={cn(buttonVariants({ size: 'sm' }), 'mt-5', className)}>
	<ChevronLeft data-icon="inline-start" />
	{@render children()}
</a>
<!-- eslint-enable svelte/no-navigation-without-resolve -->
