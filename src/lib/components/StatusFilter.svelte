<script lang="ts">
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { buttonVariants, type ButtonSize } from '$lib/components/ui/button/index.js';
	import { Circle, CircleCheck, CircleDashed } from '@lucide/svelte';
	import { cn } from '$lib/utils.js';
	import type { ProblemStatus } from '$lib/filters';

	/**
	 * The progress filter: `All problems`, `Done` or `To do`.
	 *
	 * An icon-only dropdown, not the segmented `ToggleGroup` this started as: all
	 * three labels sit in the toolbar at once in that form, which is most of a
	 * phone's width for a control sharing its row with the topic filter and the
	 * "show full year" switch. This is deliberately `TopicSelect`'s `iconOnly`
	 * trigger — same square, same fill-while-filtering rule — so the two filters
	 * read as a pair.
	 *
	 * Shared by the olympiad page's toolbar and the ⌘K dialog's input row, which
	 * is why it sits in `$lib/components/` beside `TopicSelect.svelte` rather than
	 * beside the olympiad route: a `$lib` component cannot import from a route
	 * directory, and duplicating it would give the two filters two chances to
	 * disagree. It imports only `ProblemStatus`, so nothing route-shaped came with
	 * it.
	 *
	 * Rendered only for signed-in users; the caller decides that, since "Done"
	 * could only ever be empty without a session.
	 *
	 * A `DropdownMenu.RadioGroup` and not a `Select`: radio items give the active
	 * option a check without the listbox machinery a `Select` brings, and it is
	 * the primitive `TopicSelect` already uses.
	 */
	let {
		value = $bindable('all'),
		size = 'icon'
	}: {
		value?: ProblemStatus;
		/**
		 * Trigger size, mirroring `TopicSelect`. Defaults to the olympiad page's
		 * `'icon'`; the ⌘K dialog asks for `'icon-sm'`, where four controls share
		 * the input's row and 36px squares overflow it on a phone.
		 */
		size?: ButtonSize;
	} = $props();

	/**
	 * The icons are `ProgressControl`'s, deliberately: the circle a signed-in user
	 * clicks on a card is the same circle that means "not done" here. They carry
	 * the entire state now that the trigger has no label, so they have to stay
	 * distinguishable from one another at 16px.
	 */
	const OPTIONS: { value: ProblemStatus; label: string; icon: typeof Circle }[] = [
		{ value: 'all', label: 'All problems', icon: CircleDashed },
		{ value: 'done', label: 'Done', icon: CircleCheck },
		{ value: 'todo', label: 'To do', icon: Circle }
	];

	// `?? OPTIONS[0]` is only a total-function courtesy; `value` is a closed union
	// and the radio group can never emit anything outside it.
	const current = $derived(OPTIONS.find((o) => o.value === value) ?? OPTIONS[0]);
	const CurrentIcon = $derived(current.icon);

	/**
	 * Filled while a filter is active, exactly as `TopicSelect`'s icon-only
	 * trigger is. With no text on the button the fill is the only thing saying the
	 * list is being narrowed — which is also why the *labelled* variant of that
	 * component deliberately does not do this.
	 */
	const triggerVariant = $derived(current.value === 'all' ? 'outline' : 'default');
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger
		class={cn(buttonVariants({ variant: triggerVariant, size }), 'shrink-0')}
		title="Filter by progress: {current.label}"
	>
		<!-- Uncoloured on purpose, for `TopicSelect`'s reason: it has to inherit
		     text-primary-foreground once the trigger fills. -->
		<CurrentIcon />
		<!-- The button's accessible name, since nothing visible spells it. Both
		     halves earn their place: the purpose, which the icon cannot say, and the
		     current option, which is otherwise unreachable while the menu is shut. -->
		<span class="sr-only">Filter by progress: {current.label}</span>
	</DropdownMenu.Trigger>

	<DropdownMenu.Content align="end">
		<DropdownMenu.Label>Filter by progress</DropdownMenu.Label>
		<DropdownMenu.Separator />
		<!-- Unlike the ToggleGroup this replaces, a radio group cannot be cleared by
		     re-selecting the active item, so there is no empty value to fall back
		     from — `'all'` is simply one of the three. -->
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
