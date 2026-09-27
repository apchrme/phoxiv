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
	 * A destructive submit that asks first, in an `AlertDialog`.
	 *
	 * The trigger is `type="button"` and submits nothing. Confirming calls
	 * `requestSubmit()` on the enclosing form, which runs `use:enhance` and
	 * `Pending` like a real submit. Don't use `submit()`: it bypasses both.
	 *
	 * Hand-styled from bits-ui; don't add `alert-dialog` via the shadcn CLI
	 * (CLAUDE.md rule 2).
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
		/** The page's single `Pending`, so the trigger can show its submission. */
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
	/** The trigger, used to find its enclosing form (no per-row form ids needed). */
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
				<!-- Cancel first, so it gets initial focus and a stray Enter is safe. -->
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
