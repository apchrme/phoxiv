<script lang="ts">
	import { ChevronLeft } from '@lucide/svelte';
	import { cn } from '$lib/utils.js';
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
<a
	{href}
	class={cn(
		'mt-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground no-underline transition-colors hover:text-primary',
		className
	)}
>
	<ChevronLeft class="size-4" />
	{@render children()}
</a>
<!-- eslint-enable svelte/no-navigation-without-resolve -->
