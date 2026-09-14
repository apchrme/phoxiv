<script lang="ts">
	import type { PageData } from './$types';
	import type { UserRow } from './columns';
	import { enhance } from '$app/forms';
	import type { Pending } from '$lib/forms.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
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
</script>

<div class="flex flex-wrap items-center justify-end gap-2">
	<!-- Role select -->
	<form
		method="POST"
		action="?/setRole"
		use:enhance={pending.track(user.id + '_role', {
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
			<Select.Trigger class="h-8 w-32 text-xs" disabled={pending.has(user.id + '_role')}>
				{roleLabel(role)}
			</Select.Trigger>
			<Select.Content>
				{#each ASSIGNABLE_ROLES as assignable (assignable)}
					<Select.Item value={assignable}>{roleLabel(assignable)}</Select.Item>
				{/each}
			</Select.Content>
		</Select.Root>
		<Button
			type="submit"
			size="xs"
			variant={roleDirty ? 'default' : 'outline'}
			disabled={pending.has(user.id + '_role') || !roleDirty}
		>
			Save
		</Button>
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
			use:enhance={pending.track(user.id + '_assign', {
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
			<Button
				type="submit"
				size="xs"
				variant={assignDirty ? 'default' : 'outline'}
				disabled={pending.has(user.id + '_assign') || !assignDirty}
			>
				Save
			</Button>
		</form>
	{/if}

	<Separator orientation="vertical" class="h-5" />

	<!-- Ban / Unban -->
	{#if user.banned}
		<form
			method="POST"
			action="?/unbanUser"
			use:enhance={pending.track(user.id + '_ban', { reset: true })}
		>
			<input type="hidden" name="userId" value={user.id} />
			<Button type="submit" variant="outline" size="xs" disabled={pending.has(user.id + '_ban')}>
				<CircleCheck class="size-3" />
				Unban
			</Button>
		</form>
	{:else}
		<form
			method="POST"
			action="?/banUser"
			use:enhance={pending.track(user.id + '_ban', { reset: true })}
		>
			<input type="hidden" name="userId" value={user.id} />
			<input type="hidden" name="reason" value="" />
			<Button
				type="submit"
				variant="destructive"
				size="xs"
				disabled={pending.has(user.id + '_ban')}
			>
				<Ban class="size-3" />
				Ban
			</Button>
		</form>
	{/if}
</div>
