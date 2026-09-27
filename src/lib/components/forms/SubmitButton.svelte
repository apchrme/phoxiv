<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { LucideIcon } from '@lucide/svelte';
	import type { Pending } from '$lib/forms.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import type { ButtonSize, ButtonVariant } from '$lib/components/ui/button/index.js';

	/**
	 * A form's submit button, disabled with a spinner while its submission runs.
	 *
	 * `pending` is a prop, never constructed here: one `Pending` per page, so
	 * `has()` reads the map `track()` wrote (CLAUDE.md rule 5). Pass the same `key`
	 * the form tracked under, or the button never disables.
	 */
	let {
		pending,
		key = '',
		icon,
		iconSide = 'start',
		busyLabel,
		variant = 'default',
		size = 'default',
		disabled = false,
		class: className,
		children
	}: {
		/** The page's single `Pending`. */
		pending: Pending;
		/** The key this form's `pending.track()` was given. Defaults to `track()`'s own. */
		key?: string;
		/** Shown at rest, replaced by the spinner while busy. */
		icon?: LucideIcon;
		/** Icon position. `'end'` suits forward arrows. */
		iconSide?: 'start' | 'end';
		/** Replaces the label while busy, e.g. "Uploading…". Omit to keep the label. */
		busyLabel?: string;
		variant?: ButtonVariant;
		size?: ButtonSize;
		/** Extra disabling; being busy always disables. */
		disabled?: boolean;
		class?: string;
		children: Snippet;
	} = $props();

	const busy = $derived(pending.has(key));
	const Icon = $derived(icon);

	/**
	 * Icons take their size from `buttonVariants`. `Spinner` sets its own `size-4`,
	 * which bypasses that, so size it explicitly to match on small buttons.
	 */
	const spinnerSize = $derived(size === 'xs' || size === 'icon-xs' ? 'size-3' : 'size-4');
</script>

{#snippet glyph()}
	{#if busy}
		<Spinner class={spinnerSize} />
	{:else if Icon}
		<Icon />
	{/if}
{/snippet}

<Button type="submit" {variant} {size} class={className} disabled={busy || disabled}>
	{#if iconSide === 'start'}{@render glyph()}{/if}
	{#if busy && busyLabel}
		{busyLabel}
	{:else}
		{@render children()}
	{/if}
	{#if iconSide === 'end'}{@render glyph()}{/if}
</Button>
