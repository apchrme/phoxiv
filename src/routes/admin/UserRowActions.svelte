<script lang="ts">
	import type { PageData } from './$types';
	import type { UserRow } from './columns';
	import { enhance } from '$app/forms';
	import type { Pending } from '$lib/forms.svelte';
	import { Button, buttonVariants } from '$lib/components/ui/button/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { Ban, CircleCheck, BookOpenCheck } from '@lucide/svelte';
	import { parseStringArray } from '$lib/utils/json';
	import { roleLabel } from '$lib/activity';

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

	/** Same idea for the assignment checkboxes: `null` means "unedited". */
	let assignDraft = $state<string[] | null>(null);
	const assigned = $derived(assignDraft ?? parseStringArray(user.assignedOlympiads));

	function toggleAssigned(olympiadId: string, checked: boolean) {
		assignDraft = checked ? [...assigned, olympiadId] : assigned.filter((id) => id !== olympiadId);
	}
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
				<Select.Item value="user">User</Select.Item>
				<Select.Item value="contributor">Contributor</Select.Item>
				<Select.Item value="admin">Admin</Select.Item>
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

	<!-- Assign olympiads — contributors only -->
	{#if user.role === 'contributor'}
		<DropdownMenu.Root>
			<DropdownMenu.Trigger class={buttonVariants({ variant: 'outline', size: 'xs' })}>
				<BookOpenCheck class="size-3" />
				Assign
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="end" class="max-h-72 w-56 overflow-y-auto">
				<DropdownMenu.Label>Assigned olympiads</DropdownMenu.Label>
				<DropdownMenu.Separator />
				{#each olympiads as olympiad (olympiad.id)}
					<label
						class="flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm select-none hover:bg-accent"
					>
						<input
							type="checkbox"
							checked={assigned.includes(olympiad.id)}
							onchange={(e) =>
								toggleAssigned(olympiad.id, (e.currentTarget as HTMLInputElement).checked)}
						/>
						{olympiad.name}
					</label>
				{/each}
				<DropdownMenu.Separator />
				<!-- The checkboxes above are not form controls: the dropdown content is
				     portalled to document.body, so only these hidden inputs submit. -->
				<form
					method="POST"
					action="?/setAssignedOlympiads"
					use:enhance={pending.track(user.id + '_assign', {
						reset: true,
						onDone: () => (assignDraft = null)
					})}
					class="px-1 pb-1"
				>
					<input type="hidden" name="userId" value={user.id} />
					{#each assigned as olympiadId (olympiadId)}
						<input type="hidden" name="olympiadId" value={olympiadId} />
					{/each}
					<Button
						type="submit"
						size="xs"
						class="w-full"
						disabled={pending.has(user.id + '_assign')}
					>
						Save assignments
					</Button>
				</form>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
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
