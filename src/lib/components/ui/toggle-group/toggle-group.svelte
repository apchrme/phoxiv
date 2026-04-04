<script lang="ts">
	import { ToggleGroup as ToggleGroupPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: ToggleGroupPrimitive.RootProps = $props();
</script>

<ToggleGroupPrimitive.Root
	bind:ref
	data-slot="toggle-group"
	class={cn('flex flex-wrap gap-2', className)}
	{...restProps}
/>
