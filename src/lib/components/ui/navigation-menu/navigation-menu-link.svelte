<script lang="ts">
	import { NavigationMenu as NavigationMenuPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: NavigationMenuPrimitive.LinkProps = $props();
</script>

<NavigationMenuPrimitive.Link
	bind:ref
	data-slot="navigation-menu-link"
	class={cn(
		"flex items-center gap-1.5 rounded-xl p-3 text-sm transition-all outline-none hover:bg-black/10 hover:dark:bg-white/10 focus:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 data-[active=true]:dark:bg-white/10 data-[active=true]:bg-black/10 [&_svg:not([class*='size-'])]:size-4",
		className
	)}
	{...restProps}
/>
