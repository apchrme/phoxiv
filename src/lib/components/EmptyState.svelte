<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { LucideIcon } from '@lucide/svelte';
	import { cn } from '$lib/utils.js';

	/**
	 * What a list shows when it has nothing to show: a headline, an optional
	 * explanation, and whatever the caller wants to offer as a way out.
	 *
	 * Four structurally different versions of this had grown up — the dashed box
	 * on the two olympiad pages, the centred stack inside the ⌘K dialog, and a
	 * bare `py-12 text-center` cell in each of the two admin tables — with six
	 * spellings of the same few sentences between them.
	 *
	 * # Why `variant` exists
	 *
	 * The one real bug this fixes. `SearchEmptyState` was being used for **load
	 * failures** as well as empty results, so "Couldn't load the olympiads"
	 * appeared inside a dashed empty-search box behind a button shaped exactly like
	 * "Clear search". Those are opposite situations: one says *your query matched
	 * nothing*, the other says *we never got the data*, and only the second is
	 * worth retrying. `'error'` gives the second its own colour and leaves the
	 * dashed box to mean what it looks like.
	 *
	 * # Wording
	 *
	 * `message` takes **no** full stop and `hint` does. The message is a label for
	 * a state; the hint is a sentence of advice. Keeping the rule here is the only
	 * way six call sites stay agreed on it.
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
		/** The headline. No full stop — see the header. */
		message: string;
		/** One sentence of advice, with a full stop. */
		hint?: string;
		/** A way out: a reload button, a clear-filters button. Optional; several states have none. */
		action?: Snippet;
		/**
		 * The dashed container. Turn it **off** where the state is already inside
		 * something with its own edges — a table cell, or the ⌘K dialog's results
		 * pane, where a second box inside the panel reads as a rendering fault.
		 */
		boxed?: boolean;
		class?: string;
	} = $props();

	const Icon = $derived(icon);
</script>

<div
	class={cn(
		'flex flex-col items-center gap-2 px-5 text-center',
		boxed && 'rounded-xl border border-dashed py-12',
		// `border-border` and `border-destructive/40` rather than a bare `border-*`
		// shorthand: in Mocha `--border` is Surface 1, so the error's tint is the
		// only thing separating the two boxes there.
		boxed && (variant === 'error' ? 'border-destructive/40' : 'border-border'),
		className
	)}
>
	{#if Icon}
		<Icon
			class={cn('size-8', variant === 'error' ? 'text-destructive' : 'text-muted-foreground')}
		/>
	{/if}
	<p class="m-0 text-base font-medium text-foreground">{message}</p>
	{#if hint}
		<p class="m-0 text-sm text-muted-foreground">{hint}</p>
	{/if}
	{@render action?.()}
</div>
