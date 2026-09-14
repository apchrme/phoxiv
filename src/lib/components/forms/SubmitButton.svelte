<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { LucideIcon } from '@lucide/svelte';
	import type { Pending } from '$lib/forms.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import type { ButtonSize, ButtonVariant } from '$lib/components/ui/button/index.js';

	/**
	 * A form's submit button, disabled and spinning while its own submission is in
	 * flight.
	 *
	 * Thirteen buttons were doing this in three mutually inconsistent shapes: the
	 * icon swapped for a spinner inside the button (the majority, and what this
	 * keeps), the spinner sat *beside* the button as a separate element, or the
	 * label changed while nothing else did. The point of settling it is not
	 * tidiness — `docs/contributing.md` singles the busy state out as "the thing
	 * most likely to break without a visible symptom", and thirteen hand-written
	 * copies is thirteen chances for it to.
	 *
	 * It also halves the number of times the action name is written. Each of those
	 * forms spelled it three times — in `action=`, in `pending.track()`, and again
	 * in `pending.has()` — with nothing tying the copies together, so a typo in the
	 * third left the button permanently enabled and the form permanently
	 * double-submittable. Passing the same `key` the form tracked under leaves two.
	 *
	 * The `Pending` instance is a prop and never constructed here: CLAUDE.md rule 5
	 * requires exactly one per page, because `has()` has to read the map `track()`
	 * wrote.
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
		/** The page's single tracker. */
		pending: Pending;
		/** The key this form's `pending.track()` was given. Defaults to `track()`'s own. */
		key?: string;
		/** Shown at rest, and replaced by the spinner while busy. */
		icon?: LucideIcon;
		/**
		 * Which side the icon sits on. `'end'` for the buttons whose icon is an arrow
		 * saying where the submit *goes* — that arrow reads backwards in front of its
		 * label, and the spinner replaces it in place either way.
		 */
		iconSide?: 'start' | 'end';
		/**
		 * Replaces the label while busy — "Uploading…", "Deleting…". Omit it where
		 * the label already reads as a state ("Add / go to year") and only the icon
		 * should change.
		 */
		busyLabel?: string;
		variant?: ButtonVariant;
		size?: ButtonSize;
		/** Disabled for a reason of the caller's own; being busy always disables. */
		disabled?: boolean;
		class?: string;
		children: Snippet;
	} = $props();

	const busy = $derived(pending.has(key));
	const Icon = $derived(icon);

	/**
	 * Neither glyph is given a size, so both take the one `buttonVariants` hands
	 * icons at this button's size — where the thirteen originals all pinned
	 * `size-3.5` by hand, half a step off the `size-4` everything around them used.
	 *
	 * `Spinner` is the exception and has to be told: it sets its own `size-4` in its
	 * base classes, which defeats the `:not([class*='size-'])` guard the button
	 * sizes icons through, so on an `xs` button it would sit a step larger than the
	 * icon it replaced and the row would twitch on submit.
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
