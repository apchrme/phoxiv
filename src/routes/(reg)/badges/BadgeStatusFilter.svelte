<!--
	/badges' standing filter: All badges, Earned or Not earned. An icon-only
	dropdown matching `StatusFilter`, which can't be reused: its labels are about
	problems ("Done", "To do"). The page renders it only for signed-in viewers,
	since it filters on their own standing.
-->
<script lang="ts" module>
	/** Which badges to show by the viewer's standing. `'all'` means no filter. */
	export type BadgeStatus = 'all' | 'earned' | 'unearned';
</script>

<script lang="ts">
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { buttonVariants } from '#lib/components/ui/button/index.js';
	import { Award, Circle, CircleCheck } from '@lucide/svelte';
	import { cn } from '#lib/utils.js';

	let {
		value = $bindable('all'),
		disabled = false
	}: {
		value?: BadgeStatus;
		/**
		 * Set until the viewer's standing has arrived. Filtering without it would
		 * claim they have earned nothing.
		 */
		disabled?: boolean;
	} = $props();

	/** The check matches the "Earned" line on a card. */
	const OPTIONS: { value: BadgeStatus; label: string; icon: typeof Circle }[] = [
		{ value: 'all', label: 'All badges', icon: Award },
		{ value: 'earned', label: 'Earned', icon: CircleCheck },
		{ value: 'unearned', label: 'Not earned', icon: Circle }
	];

	const current = $derived(OPTIONS.find((o) => o.value === value) ?? OPTIONS[0]);
	const CurrentIcon = $derived(current.icon);

	/** Filled while filtering; with no label, the fill is the only cue. */
	const triggerVariant = $derived(current.value === 'all' ? 'outline' : 'default');
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger
		{disabled}
		class={cn(buttonVariants({ variant: triggerVariant, size: 'icon' }), 'shrink-0')}
		title="Filter by standing: {current.label}"
	>
		<!-- Uncoloured so it inherits the foreground when the trigger fills. -->
		<CurrentIcon />
		<!-- The button's accessible name. Keep it even though `title` repeats it. -->
		<span class="sr-only">Filter by standing: {current.label}</span>
	</DropdownMenu.Trigger>

	<DropdownMenu.Content align="end">
		<DropdownMenu.Label>Filter by standing</DropdownMenu.Label>
		<DropdownMenu.Separator />
		<DropdownMenu.RadioGroup
			value={current.value}
			onValueChange={(v) => (value = v as BadgeStatus)}
		>
			{#each OPTIONS as option (option.value)}
				{@const Icon = option.icon}
				<DropdownMenu.RadioItem value={option.value}>
					<Icon class="text-muted-foreground" />
					{option.label}
				</DropdownMenu.RadioItem>
			{/each}
		</DropdownMenu.RadioGroup>
	</DropdownMenu.Content>
</DropdownMenu.Root>
