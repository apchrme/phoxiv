<!--
	The olympiad index's tag filter: a dropdown matching `TopicSelect`'s captioned
	`iconOnly` trigger, but single-choice, since an olympiad has exactly one tag.
-->
<script lang="ts">
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { buttonVariants } from '#lib/components/ui/button/index.js';
	import { Funnel } from '@lucide/svelte';
	import { OLYMPIAD_TAGS, type OlympiadTag } from '#lib/types.js';
	import { cn } from '#lib/utils.js';

	let {
		value = $bindable(null)
	}: {
		/** The selected tag. `null` means no tag filter. */
		value?: OlympiadTag | null;
	} = $props();

	const summary = $derived(`Filter by tag: ${value ?? 'All'}`);

	/** Filled while filtering; with no label, the fill is the only cue. */
	const triggerVariant = $derived(value === null ? 'outline' : 'default');
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger
		class={cn(buttonVariants({ variant: triggerVariant }), 'shrink-0')}
		title={summary}
	>
		<!-- Uncoloured so it inherits the foreground when the trigger fills. -->
		<Funnel />
		<!-- A fixed word so the button isn't mistaken for decoration. Hidden from
		     assistive tech: the sr-only name below already contains it. -->
		<span aria-hidden="true">Filter</span>
		<!-- The button's accessible name. Keep it even though `title` repeats it. -->
		<span class="sr-only">{summary}</span>
	</DropdownMenu.Trigger>

	<DropdownMenu.Content align="end">
		<DropdownMenu.Label>Filter by tag</DropdownMenu.Label>
		<DropdownMenu.Separator />
		<!-- The empty value stands for "All", since a radio value can't be null. -->
		<DropdownMenu.RadioGroup
			value={value ?? ''}
			onValueChange={(v) => (value = (v as OlympiadTag) || null)}
		>
			<DropdownMenu.RadioItem value="">All</DropdownMenu.RadioItem>
			{#each OLYMPIAD_TAGS as tag (tag)}
				<DropdownMenu.RadioItem value={tag}>{tag}</DropdownMenu.RadioItem>
			{/each}
		</DropdownMenu.RadioGroup>
	</DropdownMenu.Content>
</DropdownMenu.Root>
