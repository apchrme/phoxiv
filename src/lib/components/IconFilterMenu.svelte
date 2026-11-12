<script lang="ts" generics="T extends string">
	import type { LucideIcon } from '@lucide/svelte';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { buttonVariants, type ButtonSize } from '#lib/components/ui/button/index.js';
	import { cn } from '#lib/utils.js';

	/**
	 * An icon-only dropdown that picks one of a few filter values, matching
	 * `TopicSelect`'s `iconOnly` trigger. `StatusFilter` (problems: done or not)
	 * and `/badges`' `BadgeStatusFilter` (earned or not) are thin wrappers that
	 * supply the options.
	 *
	 * The first option is "no filter": the trigger is outlined on it and filled
	 * on any other, since with no label the fill is the only cue.
	 */
	let {
		value = $bindable(),
		options,
		heading,
		caption = undefined,
		size = caption ? 'default' : 'icon',
		disabled = false,
		class: className
	}: {
		value: T;
		/** The first is the unfiltered state. */
		options: readonly { value: T; label: string; icon: LucideIcon }[];
		/** The menu's heading, and the start of the trigger's accessible name. */
		heading: string;
		/**
		 * A fixed word beside the icon, so the control isn't mistaken for
		 * decoration. It never changes with the selection; the icon and fill do.
		 */
		caption?: string;
		size?: ButtonSize;
		disabled?: boolean;
		class?: string;
	} = $props();

	const current = $derived(options.find((o) => o.value === value) ?? options[0]);
	const CurrentIcon = $derived(current.icon);
	const triggerVariant = $derived(current.value === options[0].value ? 'outline' : 'default');
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger
		{disabled}
		class={cn(buttonVariants({ variant: triggerVariant, size }), 'shrink-0', className)}
		title="{heading}: {current.label}"
	>
		<!-- Uncoloured so it inherits the foreground when the trigger fills. -->
		<CurrentIcon />
		<!-- Hidden from assistive tech: the sr-only name below already contains it. -->
		{#if caption}<span aria-hidden="true">{caption}</span>{/if}
		<!-- The button's accessible name. Keep it even though `title` repeats it. -->
		<span class="sr-only">{heading}: {current.label}</span>
	</DropdownMenu.Trigger>

	<DropdownMenu.Content align="end">
		<DropdownMenu.Label>{heading}</DropdownMenu.Label>
		<DropdownMenu.Separator />
		<DropdownMenu.RadioGroup value={current.value} onValueChange={(v) => (value = v as T)}>
			{#each options as option (option.value)}
				{@const Icon = option.icon}
				<DropdownMenu.RadioItem value={option.value}>
					<Icon class="text-muted-foreground" />
					{option.label}
				</DropdownMenu.RadioItem>
			{/each}
		</DropdownMenu.RadioGroup>
	</DropdownMenu.Content>
</DropdownMenu.Root>
