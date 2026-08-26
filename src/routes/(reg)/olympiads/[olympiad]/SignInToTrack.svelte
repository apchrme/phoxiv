<script lang="ts">
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import { Circle } from '@lucide/svelte';
	import { cn } from '$lib/utils.js';
	import { resolve } from '$app/paths';

	/**
	 * The signed-out stand-in for `ProgressControl`: the same circle in the same
	 * corner, dimmed and inert, explaining that tracking needs an account.
	 *
	 * A sibling of `ProgressControl` rather than a branch inside it. The two are
	 * deliberately different — no popover, no score, no `entry` or `pending` — and
	 * the only thing they genuinely share is the alignment, which is duplicated
	 * below. **Change the trigger's position classes in one and change them in the
	 * other**, or the circle will jump as you sign in.
	 *
	 * `Tooltip.Provider` is not needed here: `Sidebar.Provider` in the root layout
	 * already wraps the whole app in one.
	 */
	let { number }: { number: string } = $props();

	/**
	 * bits-ui deliberately never opens a tooltip from a touch pointer — both
	 * `onpointerenter` and `onpointermove` return early on `pointerType ===
	 * 'touch'` — so on a phone the notice would be unreachable. Driving `open`
	 * ourselves for touch is the tap path; mouse and keyboard behaviour is left
	 * exactly as bits-ui designed it.
	 */
	let open = $state(false);

	/**
	 * Recorded on `pointerdown` and read on `click`, because `click` carries no
	 * `pointerType` of its own and none of this must fire for a mouse.
	 *
	 * Two things about the handler below were found the hard way:
	 *
	 * - It runs on **click, not pointerdown.** The content is a dismissible layer
	 *   listening on document `pointerdown`, so opening during that phase let the
	 *   same gesture dismiss what it had just opened.
	 * - It toggles against the state captured at **pointerdown**, not the state at
	 *   click time. Chrome on Android focuses a button when you tap it, and
	 *   bits-ui's own `onfocus` opens the tooltip from there — so a toggle reading
	 *   `open` at click time arrived second and closed what the tap had just
	 *   opened. Reading it before that focus lands makes the tap agree with what
	 *   the user actually saw, and covers iOS Safari too, which does not focus
	 *   buttons on tap and so would otherwise never show the notice at all.
	 *
	 * The tap must be able to close it as well as open it: an outside tap is not
	 * a reliable dismissal for a non-modal tooltip on every mobile browser.
	 */
	let touched = false;
	let openBeforeTap = false;
</script>

<!--
	`disableCloseOnTriggerClick` is what makes the tap above stick: without it the
	trigger's own pointerdown and click handlers call `handleClose()`, and since
	`mergeProps` *composes* handlers — ours first, then bits-ui's — the open would
	be undone inside the same event. It reaches the primitive through the vendored
	wrapper's `...restProps`, so nothing under `$lib/components/ui/` is touched.
-->
<Tooltip.Root bind:open disableCloseOnTriggerClick delayDuration={150}>
	<Tooltip.Trigger
		class={cn(
			buttonVariants({ variant: 'ghost', size: 'xs' }),
			// Mirrors ProgressControl's trigger, so the circle sits in the same place
			// whether or not you are signed in.
			'-mt-1 -mr-2 shrink-0 px-1.5',
			// Inert, but never the `disabled` attribute: bits-ui forwards that onto
			// the <button> (where Chrome and Safari then fire no pointer events at
			// all) *and* early-returns from every one of the trigger's own handlers,
			// so the notice would never open. `aria-disabled` keeps it focusable,
			// which is what lets a keyboard user tab to it and read the notice.
			'cursor-not-allowed text-muted-foreground/50 hover:bg-transparent hover:text-muted-foreground/50 dark:hover:bg-transparent'
		)}
		aria-disabled="true"
		aria-label="Sign in to track problem {number}"
		onpointerdown={(e) => {
			touched = e.pointerType === 'touch';
			openBeforeTap = open;
		}}
		onclick={() => {
			if (touched) open = !openBeforeTap;
		}}
	>
		<!-- `size-4` for the same reason ProgressControl sets it: the `xs` button
		     size would otherwise force icons down to `size-3`. -->
		<Circle class="size-4" />
	</Tooltip.Trigger>

	<!-- No native `title` on the trigger — it would double-report alongside this.
	     The content stays open while hovered (`disableHoverableContent` is off by
	     default), which is what makes the link clickable. -->
	<!--
		Styled as a *surface*, not as the vendored default pill. `tooltip-content`
		ships `bg-foreground text-background` — an inverted dark chip — and swapping
		in `bg-card` alone left it with no edge of its own: on a card-coloured page
		it read as naked text floating over the year header, and the only part that
		still looked like a container was the arrow, which the vendored file
		hardcodes to `bg-foreground`. So:

		- the elevation treatment is copied from `ProgressControl`'s popover, which
		  is this control's sibling in the very same corner — same shadow, same
		  hairline ring — so the two read as one family;
		- `arrowClasses` (exposed by the vendored content for exactly this) repaints
		  the arrow to match the bubble, leaving its geometry alone.
	-->
	<Tooltip.Content
		sideOffset={6}
		class="max-w-72 bg-card text-card-foreground shadow-2xl ring-1 ring-foreground/5 dark:ring-foreground/10"
		arrowClasses="bg-card fill-card"
	>
		<span>
			Only signed-in users can track completed problems.
			<a href={resolve('/login')} class="font-medium text-primary underline underline-offset-2">
				Sign in
			</a>
		</span>
	</Tooltip.Content>
</Tooltip.Root>
