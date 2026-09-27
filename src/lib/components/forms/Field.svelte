<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils.js';

	/**
	 * One labelled form control: label, optional inline hint, then `children`
	 * (the control, plus any notes or validation messages below it).
	 */
	let {
		label,
		for: htmlFor,
		hint,
		class: className,
		children
	}: {
		label: string;
		/**
		 * The id of the control this labels. Omit it for button-triggered pickers,
		 * which `<label for>` can't target; a `<span>` is rendered instead, and the
		 * control should have its own `aria-label`.
		 */
		for?: string;
		/** A short aside after the label, e.g. "(optional)" or a unit. */
		hint?: string;
		class?: string;
		children: Snippet;
	} = $props();
</script>

<div class={cn('flex flex-col gap-1.5', className)}>
	{#if htmlFor}
		<label for={htmlFor} class="text-sm font-medium text-foreground">
			{label}
			{#if hint}
				<span class="text-sm font-normal text-muted-foreground">{hint}</span>
			{/if}
		</label>
	{:else}
		<span class="text-sm font-medium text-foreground">
			{label}
			{#if hint}
				<span class="text-sm font-normal text-muted-foreground">{hint}</span>
			{/if}
		</span>
	{/if}
	{@render children()}
</div>
