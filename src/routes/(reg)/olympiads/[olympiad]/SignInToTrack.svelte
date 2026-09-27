<script lang="ts">
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import { Circle } from '@lucide/svelte';
	import { cn } from '$lib/utils.js';
	import { resolve } from '$app/paths';

	/**
	 * Signed-out stand-in for `ProgressControl`: the same circle, dimmed, linking
	 * to `/login`, with a tooltip explaining that tracking needs an account.
	 *
	 * Keep the trigger's position classes in sync with `ProgressControl`, or the
	 * circle jumps when you sign in.
	 */
	let { number }: { number: string } = $props();

	/** Driven by hand for touch, since bits-ui never opens tooltips from touch. */
	let open = $state(false);

	/**
	 * Captured on `pointerdown`, read on `click` (which has no `pointerType`).
	 * - Toggle on click, not pointerdown, or the dismiss layer closes it at once.
	 * - Toggle from the state before the tap: Android focuses on tap, and focus
	 *   opens the tooltip first.
	 * - A touch tap suppresses the link, or the notice is never seen on a phone.
	 */
	let touched = false;
	let openBeforeTap = false;
</script>

<!--
	`disableCloseOnTriggerClick`: otherwise bits-ui's own trigger handlers close
	the tooltip in the same event that opened it.
-->
<Tooltip.Root bind:open disableCloseOnTriggerClick delayDuration={150}>
	<Tooltip.Trigger
		class={cn(
			buttonVariants({ variant: 'ghost', size: 'xs' }),
			// Same position as ProgressControl's trigger.
			'-mt-1 -mr-2 shrink-0 px-1.5',
			// Never use `disabled`: it blocks pointer events and bits-ui's handlers,
			// so the tooltip would never open.
			'text-muted-foreground/60 hover:text-foreground'
		)}
		aria-label="Sign in to track problem {number}"
		onpointerdown={(e) => {
			touched = e.pointerType === 'touch';
			openBeforeTap = open;
		}}
		onclick={(e) => {
			// Clear on every click: keyboard Enter clicks without a pointerdown, and a
			// stale `true` would swallow its navigation.
			const wasTouch = touched;
			touched = false;
			if (!wasTouch) return;
			// A tap opens the notice instead of navigating; its "Sign in" link is the
			// touch route to /login. `preventDefault` also skips bits-ui's onclick.
			e.preventDefault();
			open = !openBeforeTap;
		}}
	>
		{#snippet child({ props })}
			<!--
				The trigger is the link, because keyboard users can't reach a link inside
				the tooltip. `type={undefined}` drops the primitive's `type="button"`.
			-->
			<a {...props} type={undefined} href={resolve('/login')}>
				<!-- `size-4`: the `xs` button size would shrink icons to `size-3`. -->
				<Circle class="size-4" />
			</a>
		{/snippet}
	</Tooltip.Trigger>

	<!-- This link is the only route to /login on touch, where the trigger doesn't
	     navigate. Styled like ProgressControl's popover; `arrowClasses` repaints
	     the arrow to match. Don't give the trigger a `title`: screen readers would
	     announce it alongside this tooltip. -->
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
