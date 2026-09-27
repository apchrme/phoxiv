<script lang="ts">
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { buttonVariants, type ButtonSize } from '$lib/components/ui/button/index.js';
	import { Circle, CircleCheck, CircleDashed } from '@lucide/svelte';
	import { cn } from '$lib/utils.js';
	import type { ProblemStatus } from '$lib/filters';

	/**
	 * The progress filter: All problems, Done or To do. An icon-only dropdown
	 * matching `TopicSelect`'s `iconOnly` trigger. Used by the olympiad page and
	 * the ⌘K dialog. Callers render it only for signed-in users.
	 */
	let {
		value = $bindable('all'),
		size = 'icon'
	}: {
		value?: ProblemStatus;
		/** Trigger size. The ⌘K dialog uses `'icon-sm'` to fit its row on a phone. */
		size?: ButtonSize;
	} = $props();

	/** Same icons as `ProgressControl`, so "not done" looks the same everywhere. */
	const OPTIONS: { value: ProblemStatus; label: string; icon: typeof Circle }[] = [
		{ value: 'all', label: 'All problems', icon: CircleDashed },
		{ value: 'done', label: 'Done', icon: CircleCheck },
		{ value: 'todo', label: 'To do', icon: Circle }
	];

	const current = $derived(OPTIONS.find((o) => o.value === value) ?? OPTIONS[0]);
	const CurrentIcon = $derived(current.icon);

	/** Filled while filtering; with no label, the fill is the only cue. */
	const triggerVariant = $derived(current.value === 'all' ? 'outline' : 'default');
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger
		class={cn(buttonVariants({ variant: triggerVariant, size }), 'shrink-0')}
		title="Filter by progress: {current.label}"
	>
		<!-- Uncoloured so it inherits the foreground when the trigger fills. -->
		<CurrentIcon />
		<!-- The button's accessible name. Keep it even though `title` repeats it. -->
		<span class="sr-only">Filter by progress: {current.label}</span>
	</DropdownMenu.Trigger>

	<DropdownMenu.Content align="end">
		<DropdownMenu.Label>Filter by progress</DropdownMenu.Label>
		<DropdownMenu.Separator />
		<DropdownMenu.RadioGroup
			value={current.value}
			onValueChange={(v) => (value = v as ProblemStatus)}
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
