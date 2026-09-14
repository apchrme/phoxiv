<script lang="ts">
	import type { Snippet } from 'svelte';
	import { AlertDialog } from 'bits-ui';
	import type { LucideIcon } from '@lucide/svelte';
	import type { Pending } from '$lib/forms.svelte';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import type { ButtonSize, ButtonVariant } from '$lib/components/ui/button/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { cn } from '$lib/utils.js';

	/**
	 * A destructive submit that asks first, in the app's own chrome.
	 *
	 * Three permanent actions — delete a file, delete a year, prune the text index
	 * — asked with `window.confirm()`, which is the operating system's dialog in an
	 * otherwise entirely custom design system: unstyleable, unthemeable, and
	 * showing the page's URL above the question. Meanwhile **Ban user**, which is
	 * at least as permanent, asked nothing at all.
	 *
	 * # This changes the control flow, and that is the whole point of the file
	 *
	 * The `TrackOptions.confirm` this replaced was synchronous: `use:enhance` called
	 * it *during* the submit and cancelled inline if the user declined. An
	 * `AlertDialog` cannot work that way — it returns immediately and answers later
	 * — so the order inverts from "submit, then ask" to "ask, then submit". The
	 * button here is therefore `type="button"` and does not submit anything;
	 * confirming calls `requestSubmit()` on the enclosing form, which runs
	 * `use:enhance` and `Pending` exactly as a real submit does. `requestSubmit` and
	 * not `submit()`, which bypasses both.
	 *
	 * That option is gone rather than left beside this: with every call site
	 * migrated it had no callers, and a second way to ask is how the two drift apart.
	 * `TrackOptions.guard` is not a replacement — it blocks a submit that must not
	 * happen and toasts why, which is a different question from asking permission.
	 *
	 * # Why it is hand-styled
	 *
	 * `alert-dialog` is not vendored, and adding it means the shadcn CLI, which
	 * CLAUDE.md rule 2 keeps away from `ui/`. The overlay and panel classes are
	 * `GlobalSearch`'s own dialog's, which is this codebase's precedent for
	 * hand-styling a bits-ui primitive where no vendored component fits.
	 */
	let {
		pending,
		key = '',
		title,
		description,
		confirmLabel = 'Delete',
		cancelLabel = 'Cancel',
		icon,
		variant = 'destructive',
		size = 'default',
		disabled = false,
		class: className,
		children
	}: {
		/** The page's single tracker, so the trigger can show the submission it starts. */
		pending: Pending;
		/** The key the enclosing form's `pending.track()` was given. */
		key?: string;
		/** The question, as a statement — "Delete IPhO 2019?" */
		title: string;
		/** What confirming actually does, and that it cannot be undone. */
		description: string;
		/** The confirming button's label. Name the act, never "OK". */
		confirmLabel?: string;
		cancelLabel?: string;
		/** Shown on the trigger at rest, replaced by a spinner while the submission runs. */
		icon?: LucideIcon;
		variant?: ButtonVariant;
		size?: ButtonSize;
		disabled?: boolean;
		class?: string;
		/** The trigger's label. */
		children: Snippet;
	} = $props();

	let open = $state(false);
	/**
	 * The trigger, kept so the form can be found from it. Walking up from the
	 * button rather than taking a form `id` prop: several of these sit in `{#each}`
	 * rows where an id would have to be made unique per row, and the button is
	 * always inside the form it submits.
	 */
	let trigger = $state<HTMLElement | null>(null);

	const busy = $derived(pending.has(key));
	const Icon = $derived(icon);
	const spinnerSize = $derived(size === 'xs' || size === 'icon-xs' ? 'size-3' : 'size-4');

	function submit() {
		open = false;
		trigger?.closest('form')?.requestSubmit();
	}
</script>

<AlertDialog.Root bind:open>
	<AlertDialog.Trigger
		bind:ref={trigger}
		type="button"
		class={cn(buttonVariants({ variant, size }), className)}
		disabled={busy || disabled}
	>
		{#if busy}
			<Spinner class={spinnerSize} />
		{:else if Icon}
			<Icon />
		{/if}
		{@render children()}
	</AlertDialog.Trigger>

	<AlertDialog.Portal>
		<AlertDialog.Overlay
			class="fixed inset-0 z-50 bg-white/30 backdrop-blur-md dark:bg-black/30 data-open:animate-in data-open:duration-150 data-open:fade-in-0 data-closed:animate-out data-closed:duration-150 data-closed:fade-out-0"
		/>
		<AlertDialog.Content
			class="fixed top-1/2 left-1/2 z-50 flex w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-2xl bg-popover p-6 text-popover-foreground shadow-2xl ring-1 ring-foreground/5 outline-none dark:ring-foreground/10 data-open:animate-in data-open:duration-200 data-open:fade-in-0 data-open:zoom-in-[0.97] data-closed:animate-out data-closed:duration-150 data-closed:fade-out-0 data-closed:zoom-out-[0.97]"
		>
			<AlertDialog.Title class="text-lg font-semibold tracking-tight">
				{title}
			</AlertDialog.Title>
			<AlertDialog.Description class="m-0 text-sm text-muted-foreground">
				{description}
			</AlertDialog.Description>
			<div class="mt-2 flex justify-end gap-2">
				<!-- `Cancel` first in the DOM so it takes the dialog's initial focus: the
				     safe answer is the one a stray Enter should give. -->
				<AlertDialog.Cancel class={buttonVariants({ variant: 'outline', size: 'sm' })}>
					{cancelLabel}
				</AlertDialog.Cancel>
				<AlertDialog.Action
					onclick={submit}
					class={buttonVariants({ variant: 'destructive', size: 'sm' })}
				>
					{confirmLabel}
				</AlertDialog.Action>
			</div>
		</AlertDialog.Content>
	</AlertDialog.Portal>
</AlertDialog.Root>
