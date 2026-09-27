<!--
	A dropdown of topic checkboxes, used both to assign topics (contribute page)
	and to filter by them (olympiad page), so both offer the same options.
-->
<script lang="ts">
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import {
		buttonVariants,
		type ButtonSize,
		type ButtonVariant
	} from '$lib/components/ui/button/index.js';
	import { Tags, ChevronDown, Funnel } from '@lucide/svelte';
	import { PROBLEM_TOPICS, type ProblemTopic } from '$lib/types.js';
	import { cn } from '$lib/utils.js';
	import { plural } from '$lib/utils/plural';

	let {
		value = $bindable([]),
		label = 'Topics',
		heading = 'Topics',
		align = 'start',
		variant = 'outline',
		size = undefined,
		iconOnly = false,
		class: className
	}: {
		/** Currently selected topics, always in `PROBLEM_TOPICS` order. */
		value?: ProblemTopic[];
		/** Trigger text shown while nothing is selected. */
		label?: string;
		/** Heading shown at the top of the dropdown. */
		heading?: string;
		align?: 'start' | 'center' | 'end';
		variant?: ButtonVariant;
		size?: ButtonSize;
		/** Collapse the trigger to a funnel icon, filled while any topic is selected. */
		iconOnly?: boolean;
		class?: string;
	} = $props();

	function toggle(topic: ProblemTopic, checked: boolean) {
		// Rebuilt from PROBLEM_TOPICS so the stored order doesn't depend on click order.
		value = checked
			? PROBLEM_TOPICS.filter((t) => t === topic || value.includes(t))
			: value.filter((t) => t !== topic);
	}

	const summary = $derived(
		value.length === 0 ? label : value.length === 1 ? value[0] : plural(value.length, 'topic')
	);

	const triggerSize = $derived(size ?? (iconOnly ? 'icon' : 'default'));

	// Only the icon-only trigger fills. A labelled one already shows the selection,
	// and in a form a filled button would look like the submit button.
	const triggerVariant = $derived(iconOnly && value.length > 0 ? 'default' : variant);
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger
		class={cn(buttonVariants({ variant: triggerVariant, size: triggerSize }), className)}
		title={summary}
	>
		{#if iconOnly}
			<!-- Uncoloured so it inherits the foreground when filled. -->
			<Funnel />
			<span class="sr-only">{heading}</span>
		{:else}
			<Tags class="text-muted-foreground" />
			{summary}
			<ChevronDown class="text-muted-foreground" />
		{/if}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content {align} class="w-56">
		<DropdownMenu.Label>{heading}</DropdownMenu.Label>
		<DropdownMenu.Separator />
		{#each PROBLEM_TOPICS as topic (topic)}
			<label
				class="flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm select-none hover:bg-accent"
			>
				<input
					type="checkbox"
					checked={value.includes(topic)}
					onchange={(e) => toggle(topic, e.currentTarget.checked)}
				/>
				{topic}
			</label>
		{/each}
		{#if value.length > 0}
			<DropdownMenu.Separator />
			<DropdownMenu.Item closeOnSelect={false} onSelect={() => (value = [])}>
				Clear selection
			</DropdownMenu.Item>
		{/if}
	</DropdownMenu.Content>
</DropdownMenu.Root>
