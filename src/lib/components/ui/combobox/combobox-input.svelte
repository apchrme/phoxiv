<script lang="ts">
	import { cn } from '$lib/utils.js';
	import { Combobox } from 'bits-ui';
	import type { WithoutChild } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: WithoutChild<Combobox.InputProps> = $props();
</script>

<Combobox.Input
	bind:ref
	data-slot="combobox-input"
	class={cn(
		'h-9 w-full min-w-0 rounded-4xl border border-input bg-input/30 px-3 py-1 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 md:text-sm dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40',
		className
	)}
	{...restProps}
/>
