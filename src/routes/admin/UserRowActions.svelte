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
	 * Everything an admin can do to one user: change the role, pick the olympiads
	 * a contributor may edit, and ban or unban.
	 *
	 * Never rendered for the acting admin's own row — the server refuses those
	 * operations anyway, and offering them would only invite a lockout.
	 */
	let {
		user,
		olympiads,
		pending
	}: {
		user: UserRow;
		olympiads: PageData['olympiads'];
		/**
		 * The page's single tracker. Keys stay scoped per user *and* per operation
		 * because one map serves every row: `has()` has to read exactly what
		 * `track()` wrote, or the button never disables.
		 */
		pending: Pending;
	} = $props();

	/**
	 * The role the select is showing, as a draft over the stored value.
	 *
	 * Deliberately NOT bound to `user.role` directly — a select wired straight to
	 * reactive server data plus an auto-submitting `onValueChange` caused an
	 * infinite submit loop (the post-submit reload re-supplied `value`, which
	 * re-fired `onValueChange`, which submitted again, forever). Draft state plus
	 * an explicit Save button avoids that entirely.
	 *
	 * `null` means "no local edit", so the row reads through to the server value.
	 * Deriving it that way rather than seeding `$state` from the prop also means
	 * a row that gets re-used for a different user cannot show the previous
	 * user's draft.
	 */
	let roleDraft = $state<string | null>(null);
	/**
	 * Resolved once so the displayed value and the dirty check cannot disagree
	 * about what "no role" looks like. `role` is nullable with no default, so NULL
	 * is the ordinary state for a plain user — comparing the display value against
	 * a differently-defaulted stored value made every untouched row read as edited.
	 */
	const storedRole = $derived(user.role ?? 'user');
	const role = $derived(roleDraft ?? storedRole);
	const roleDirty = $derived(role !== storedRole);

	/**
	 * Same idea for the assignments: `null` means "unedited", which is why the
	 * picker below is driven one-way — `values` in, `onValuesChange` out — rather
	 * than bound. Binding would collapse the draft into the displayed value and
	 * leave the Save button with nothing to compare against, which is the shape
	 * that produced the role select's submit loop.
	 */
	let assignDraft = $state<string[] | null>(null);
	const storedAssigned = $derived(parseStringArray(user.assignedOlympiads));
	const assigned = $derived(assignDraft ?? storedAssigned);

	/**
	 * Compared as *sets*, not as arrays. The picker emits its selection in the
	 * olympiad table's display order, while a value stored by an older save is in
	 * whatever order that one happened to submit — so an order-sensitive check would
	 * light up Save on a row nobody had touched. Toggling an olympiad on and back
	 * off likewise has to settle back to clean.
	 */
	const assignDirty = $derived(
		assigned.length !== storedAssigned.length || assigned.some((id) => !storedAssigned.includes(id))
	);

	/**
	 * This row's three `Pending` keys.
	 *
	 * One map serves every row, so the keys have to be scoped per user *and* per
	 * operation. Derived in one place rather than concatenated at each of the six
	 * reads: `has()` must be given exactly what `track()` was, and a typo in one of
	 * two matching literals leaves the button permanently enabled with nothing on
	 * screen to say so.
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
			// Drop the draft so the row falls back to reading straight from the
			// (now-updated) server data again.
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

	<!-- Assign olympiads — contributors only.

	     This was a dropdown holding an unsearchable column of one native checkbox
	     per olympiad, which grows every time somebody adds a contest. It is the same
	     question deep search and the contribute page ask, so it gets the same
	     answer: `OlympiadPicker`, which brings the search box, the icons, the empty
	     state and the "Clear selection" row the column never had. The picker's hidden
	     inputs render in place, inside this `<form>`, which is what the old
	     checkboxes could not do — see its header.

	     Sized to the row rather than left full-width: this shares a line with the
	     role select, and `cn` lets the caller win. -->
	{#if user.role === 'contributor'}
		<form
			method="POST"
			action="?/setAssignedOlympiads"
			use:enhance={pending.track(() => key.assign, {
				reset: true,
				// Drop the draft so the row falls back to reading straight from the
				// (now-updated) server data again.
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

	<!-- Ban / Unban, as one form. These were two, differing only in the action name,
	     the icon and the variant — and in whether they asked, which they should not
	     have: banning is permanent and was the only unguarded destructive action in
	     the app, while three less consequential ones asked. -->
	<form
		method="POST"
		action={user.banned ? '?/unbanUser' : '?/banUser'}
		use:enhance={pending.track(() => key.ban, { reset: true })}
	>
		<input type="hidden" name="userId" value={user.id} />
		<!-- Submitted on both branches. `unbanUser` ignores it, and an input behind a
		     condition is one more thing to get wrong for no gain. -->
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
