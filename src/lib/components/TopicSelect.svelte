<!--
	A dropdown of checkboxes over the fixed topic list. Used both to assign topics
	to a problem on the contribute page and to filter problems by topic on the
	olympiad page, so the two always offer exactly the same options.
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
		/**
		 * Collapse the trigger to a funnel icon of fixed width, filled while any
		 * topic is selected. For the olympiad page, where the trigger shares a row
		 * with the search input even on a phone and so cannot grow with its label.
		 */
		iconOnly?: boolean;
		class?: string;
	} = $props();

	function toggle(topic: ProblemTopic, checked: boolean) {
		// Rebuild from PROBLEM_TOPICS so the order (and hence the summary text and
		// the stored JSON) doesn't depend on the order the user clicked in.
		value = checked
			? PROBLEM_TOPICS.filter((t) => t === topic || value.includes(t))
			: value.filter((t) => t !== topic);
	}

	const summary = $derived(
		value.length === 0 ? label : value.length === 1 ? value[0] : `${value.length} topics`
	);

	const triggerSize = $derived(size ?? (iconOnly ? 'icon' : 'default'));

	// Only the icon-only trigger fills in: with a label the summary already says
	// what is selected, and on the contribute page the dropdown sits in a form,
	// where a primary fill would read as the submit button.
	const triggerVariant = $derived(iconOnly && value.length > 0 ? 'default' : variant);
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger
		class={cn(buttonVariants({ variant: triggerVariant, size: triggerSize }), className)}
		title={summary}
	>
		{#if iconOnly}
			<!-- Uncoloured on purpose: it has to inherit text-primary-foreground once filled. -->
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
