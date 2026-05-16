<script lang="ts">
	import { Combobox as ComboboxPrimitive } from 'bits-ui';
	import ComboboxPortal from './combobox-portal.svelte';
	import ComboboxScrollUpButton from './combobox-scroll-up-button.svelte';
	import ComboboxScrollDownButton from './combobox-scroll-down-button.svelte';
	import { cn, type WithoutChild } from '$lib/utils.js';
	import type { ComponentProps } from 'svelte';
	import type { WithoutChildrenOrChild } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		sideOffset = 4,
		portalProps,
		children,
		preventScroll = true,
		...restProps
	}: WithoutChild<ComboboxPrimitive.ContentProps> & {
		portalProps?: WithoutChildrenOrChild<ComponentProps<typeof ComboboxPortal>>;
	} = $props();
</script>

<ComboboxPortal {...portalProps}>
	<ComboboxPrimitive.Content
		bind:ref
		{sideOffset}
		{preventScroll}
		data-slot="combobox-content"
		class={cn(
			'relative isolate z-50 min-w-36 overflow-x-hidden overflow-y-auto rounded-2xl bg-popover text-popover-foreground shadow-2xl ring-1 ring-foreground/5 duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
			className
		)}
		{...restProps}
	>
		<ComboboxScrollUpButton />
		<ComboboxPrimitive.Viewport
			class={cn(
				'h-(--bits-combobox-anchor-height) w-full min-w-(--bits-combobox-anchor-width) scroll-my-1'
			)}
		>
			{@render children?.()}
		</ComboboxPrimitive.Viewport>
		<ComboboxScrollDownButton />
	</ComboboxPrimitive.Content>
</ComboboxPortal>
