<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { LucideIcon } from '@lucide/svelte';
	import { cn } from '$lib/utils.js';

	/**
	 * What a list shows when it has nothing to show: headline, optional hint, and
	 * an optional action. Use `variant="error"` for load failures, so they don't
	 * look like an empty search. `message` has no full stop; `hint` does.
	 */
	let {
		variant = 'empty',
		icon,
		message,
		hint,
		action,
		boxed = true,
		class: className
	}: {
		/** `'error'` for "we could not fetch this", `'empty'` for "there is nothing here". */
		variant?: 'empty' | 'error';
		icon?: LucideIcon;
		/** The headline, with no full stop. */
		message: string;
		/** One sentence of advice, with a full stop. */
		hint?: string;
		/** A way out, e.g. a reload or clear-filters button. */
		action?: Snippet;
		/** The dashed box. Turn off inside something that already has edges, like a table cell. */
		boxed?: boolean;
		class?: string;
	} = $props();

	const Icon = $derived(icon);
</script>

<div
	class={cn(
		'flex flex-col items-center gap-2 px-5 text-center',
		boxed && 'rounded-xl border border-dashed py-12',
		boxed && (variant === 'error' ? 'border-destructive/40' : 'border-border'),
		className
	)}
>
	{#if Icon}
		<Icon
			class={cn('size-8', variant === 'error' ? 'text-destructive' : 'text-muted-foreground')}
		/>
	{/if}
	<p class="m-0 text-base font-medium text-muted-foreground">{message}</p>
	{#if hint}
		<p class="m-0 text-sm text-muted-foreground">{hint}</p>
	{/if}
	{@render action?.()}
</div>
