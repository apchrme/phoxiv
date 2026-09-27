<script lang="ts">
	import type { PageData } from './$types';
	import type { UserRow } from './columns';
	import { enhance } from '$app/forms';
	import type { Pending } from '$lib/forms.svelte';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import SubmitButton from '$lib/components/forms/SubmitButton.svelte';
	import ConfirmSubmit from '$lib/components/forms/ConfirmSubmit.svelte';
	import * as Select from '$lib/components/ui/select/index.js';
	import OlympiadPicker from '$lib/components/OlympiadPicker.svelte';
	import { Ban, CircleCheck } from '@lucide/svelte';
	import { parseStringArray } from '$lib/utils/json';
	import { ASSIGNABLE_ROLES, roleLabel } from '$lib/activity';

	/**
	 * An admin's actions on one user: role, assigned olympiads, ban/unban.
	 * Not rendered for the admin's own row; the server refuses those anyway.
	 */
	let {
		user,
		olympiads,
		pending
	}: {
		user: UserRow;
		olympiads: PageData['olympiads'];
		/** The page's single `Pending`, shared by every row. */
		pending: Pending;
	} = $props();

	/**
	 * A draft over the stored role; `null` means unedited. Don't bind the select
	 * to `user.role` and auto-submit on change: the post-submit reload re-fires
	 * `onValueChange`, causing an infinite submit loop. Draft plus Save avoids it.
	 */
	let roleDraft = $state<string | null>(null);
	/** `role` is NULL for plain users; default it once so the dirty check agrees. */
	const storedRole = $derived(user.role ?? 'user');
	const role = $derived(roleDraft ?? storedRole);
	const roleDirty = $derived(role !== storedRole);

	/** Same pattern: the picker is driven one-way, not bound, so Save can compare. */
	let assignDraft = $state<string[] | null>(null);
	const storedAssigned = $derived(parseStringArray(user.assignedOlympiads));
	const assigned = $derived(assignDraft ?? storedAssigned);

	/** Compared as sets: stored order may differ from the picker's display order. */
	const assignDirty = $derived(
		assigned.length !== storedAssigned.length || assigned.some((id) => !storedAssigned.includes(id))
	);

	/**
	 * This row's `Pending` keys, scoped per user and operation. Defined once so
	 * `has()` always reads exactly what `track()` wrote.
	 */
	const key = $derived({
		role: `${user.id}_role`,
		assign: `${user.id}_assign`,
		ban: `${user.id}_ban`
	});
</script>

<div class="flex flex-wrap items-center justify-end gap-2">
	<!-- Role select -->
	<form
		method="POST"
		action="?/setRole"
		use:enhance={pending.track(() => key.role, {
			reset: true,
			// Drop the draft so the row reads the updated server data.
			onDone: () => (roleDraft = null)
		})}
		class="flex items-center gap-1.5"
	>
		<input type="hidden" name="userId" value={user.id} />
		<input type="hidden" name="role" value={role} />
		<Select.Root type="single" value={role} onValueChange={(v) => (roleDraft = v)}>
			<Select.Trigger class="h-8 w-32 text-xs" disabled={pending.has(key.role)}>
				{roleLabel(role)}
			</Select.Trigger>
			<Select.Content>
				{#each ASSIGNABLE_ROLES as assignable (assignable)}
					<Select.Item value={assignable}>{roleLabel(assignable)}</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>
		<SubmitButton
			{pending}
			key={key.role}
			size="xs"
			variant={roleDirty ? 'default' : 'outline'}
			disabled={!roleDirty}
		>
			Save
		</SubmitButton>
	</form>

	<!-- Assign olympiads, contributors only. The picker's hidden inputs render
	     inside this form. -->
	{#if user.role === 'contributor'}
		<form
			method="POST"
			action="?/setAssignedOlympiads"
			use:enhance={pending.track(() => key.assign, {
				reset: true,
				onDone: () => (assignDraft = null)
			})}
			class="flex items-center gap-1.5"
		>
			<input type="hidden" name="userId" value={user.id} />
			<OlympiadPicker
				multiple
				name="olympiadId"
				values={assigned}
				onValuesChange={(v) => (assignDraft = v)}
				{olympiads}
				heading="Assigned olympiads"
				placeholder="Assign olympiads"
				class="h-8 w-44 text-xs"
			/>
			<SubmitButton
				{pending}
				key={key.assign}
				size="xs"
				variant={assignDirty ? 'default' : 'outline'}
				disabled={!assignDirty}
			>
				Save
			</SubmitButton>
		</form>
	{/if}

	<Separator orientation="vertical" class="h-5" />

	<!-- Ban / unban in one form. Banning asks for confirmation; unbanning doesn't. -->
	<form
		method="POST"
		action={user.banned ? '?/unbanUser' : '?/banUser'}
		use:enhance={pending.track(() => key.ban, { reset: true })}
	>
		<input type="hidden" name="userId" value={user.id} />
		<!-- Sent on both branches; `unbanUser` ignores it. -->
		<input type="hidden" name="reason" value="" />
		{#if user.banned}
			<SubmitButton {pending} key={key.ban} variant="outline" size="xs" icon={CircleCheck}>
				Unban
			</SubmitButton>
		{:else}
			<ConfirmSubmit
				{pending}
				key={key.ban}
				size="xs"
				icon={Ban}
				title="Ban {user.name}?"
				description="They are signed out and cannot sign in again until an admin unbans them. Their contributions are left untouched."
				confirmLabel="Ban user"
			>
				Ban
			</ConfirmSubmit>
		{/if}
	</form>
</div>
