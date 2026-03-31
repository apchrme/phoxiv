<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		value = $bindable(),
		class: className,
		...restProps
	}: WithElementRef<HTMLInputAttributes> = $props();
</script>

<input
	bind:this={ref}
	bind:value
	data-slot="input"
	class={cn(
		'flex h-9 w-full min-w-0 rounded-4xl border border-input bg-input/30 px-3 py-1 text-sm text-foreground shadow-xs transition-shadow outline-none placeholder:text-muted-foreground',
		'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
		'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
		'disabled:pointer-events-none disabled:opacity-50',
		'selection:bg-primary selection:text-primary-foreground',
		className
	)}
	{...restProps}
/>
