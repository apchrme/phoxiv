<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		children,
		size = 'default',
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & { size?: 'default' | 'sm' } = $props();
</script>

<div
	bind:this={ref}
	data-slot="card"
	data-size={size}
	class={cn(
		'group/card flex flex-col gap-3 sm:gap-5 overflow-hidden rounded-2xl py-3 sm:py-5 text-sm text-card-foreground',
        'bg-white/55 dark:bg-white/6 border border-white/70 dark:border-white/10 backdrop-blur-none md:backdrop-blur-md shadow-md shadow-black/5 dark:shadow-black/20 ring-1 ring-inset ring-white/50 dark:ring-white/5',
		'has-[>img:first-child]:pt-0 data-[size=sm]:gap-4 data-[size=sm]:py-4 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
