<script lang="ts">
	import type { PageProps } from './$types';
	import SvelteSeo from 'svelte-seo';
	import Title from '$lib/components/Title.svelte';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { formToasts, Pending } from '$lib/forms.svelte';
	import UsersTable from './UsersTable.svelte';
	import ActivityLogTable from './ActivityLogTable.svelte';
	import IndexPanel from './IndexPanel.svelte';

	let { data, form }: PageProps = $props();

	let tab = $state('users');

	/**
	 * Whether the Index tab has ever been opened.
	 *
	 * bits-ui renders every `Tabs.Content`'s children unconditionally and merely
	 * hides the inactive panels via props, so all three mount on page load —
	 * `IndexPanel` would fire its fetch immediately and save nothing. That fetch
	 * costs ~4,500 D1 rows, which is the entire cost this deferral exists to
	 * avoid, so the gate is load-bearing rather than tidy.
	 *
	 * Latched in the tab callback rather than derived from `tab` in an
	 * `$effect`: the flag is written by the event that causes it. `onValueChange`
	 * fires for keyboard activation too, so nothing is missed.
	 *
	 * It stays true once set, so **re-entering the tab does not refetch** —
	 * re-paying those rows per visit would give most of the saving back, and the
	 * numbers only move via the three maintenance actions, an upload elsewhere,
	 * or a backfill. The panel's own Refresh button covers the last two.
	 */
	let indexSeen = $state(false);

	/**
	 * In-flight submissions for every row's forms, keyed by `<userId>_<operation>`.
	 *
	 * One instance for the whole page, passed down. `has()` reads the same map
	 * `track()` writes, so a per-row instance would have to own both sides — and
	 * getting that half-right is exactly how the busy state stops appearing.
	 */
	const pending = new Pending();

	// Called once, here, because this is the component that owns `form`.
	formToasts(() => form, {
		setRole: 'Role updated',
		setAssignedOlympiads: 'Assignments saved',
		banUser: 'User banned',
		unbanUser: 'User unbanned',
		ensureIndex: 'Search index rebuilt',
		optimizeIndex: 'Index segments merged',
		pruneIndex: 'Orphaned index rows removed'
	});
</script>

<SvelteSeo title="Admin — phoXiv" description="phoXiv admin panel" />

<Title title="Admin" description="Manage user roles and access, and view 100 most recent logs." />

<Tabs.Root
	value={tab}
	onValueChange={(v) => {
		tab = v;
		if (v === 'index') indexSeen = true;
	}}
	class="gap-4"
>
	<Tabs.List>
		<Tabs.Trigger value="users">Users</Tabs.Trigger>
		<Tabs.Trigger value="log">Log</Tabs.Trigger>
		<Tabs.Trigger value="index">Index</Tabs.Trigger>
	</Tabs.List>

	<Tabs.Content value="users">
		<UsersTable
			users={data.users}
			olympiads={data.olympiads}
			currentUserId={data.user?.id}
			{pending}
		/>
	</Tabs.Content>

	<Tabs.Content value="log">
		<ActivityLogTable log={data.log} />
	</Tabs.Content>

	<Tabs.Content value="index">
		{#if indexSeen}
			<IndexPanel {pending} />
		{/if}
	</Tabs.Content>
</Tabs.Root>
