<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Pending } from '#lib/forms.svelte.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import ConfirmSubmit from '#lib/components/forms/ConfirmSubmit.svelte';
	import { Trash } from '@lucide/svelte';

	/**
	 * The `?/deleteOlympiad` form, for the superadmin only: the page renders it
	 * only when the load says `canDelete`, and the action checks for itself.
	 * Don't render errors inline: the page's `formToasts` already toasts them.
	 */
	let {
		olympiadName,
		pending,
		onDeleted
	}: {
		olympiadName: string;
		/** The page's single `Pending`, so the trigger can show its submission. */
		pending: Pending;
		/** Called when the action redirects, so the editor doesn't ask about unsaved edits. */
		onDeleted: () => void;
	} = $props();

	// The page's one `Pending` never changes, and `use:enhance` captures this at
	// mount anyway, so reading `pending` once is right.
	// svelte-ignore state_referenced_locally
	const submit = pending.track('deleteOlympiad', {
		onDone: (result) => {
			if (result.type === 'redirect') onDeleted();
		}
	});
</script>

<Card.Root class="border-destructive/40">
	<Card.Header class="border-b border-destructive/40">
		<Card.Title class="text-destructive">Delete olympiad</Card.Title>
		<Card.Description>
			Only the superadmin sees this. It permanently removes the olympiad and everything under it.
		</Card.Description>
	</Card.Header>
	<Card.Content>
		<form method="POST" action="?/deleteOlympiad" use:enhance={submit}>
			<ConfirmSubmit
				{pending}
				key="deleteOlympiad"
				icon={Trash}
				size="sm"
				title="Delete {olympiadName}?"
				description="The olympiad, all of its years and problems, every uploaded file and its icon are permanently removed — along with every user's tracked progress on those problems. This cannot be undone."
				confirmLabel="Delete olympiad"
			>
				Delete this olympiad
			</ConfirmSubmit>
		</form>
	</Card.Content>
</Card.Root>
