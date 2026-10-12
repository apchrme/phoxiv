<script lang="ts">
	import type { PageProps } from './$types';
	import SvelteSeo from 'svelte-seo';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { formToasts, Pending } from '$lib/forms.svelte';
	import { plural } from '$lib/utils/plural';
	import UsersTable from './UsersTable.svelte';
	import ActivityLogTable from './ActivityLogTable.svelte';
	import IndexPanel from './IndexPanel.svelte';

	let { data, form }: PageProps = $props();

	let tab = $state('users');

	/**
	 * Whether the Index tab has been opened. bits-ui mounts every tab's content
	 * at once, so without this gate `IndexPanel` would run its expensive stats
	 * fetch on every page load. Stays true, so re-entering doesn't refetch.
	 */
	let indexSeen = $state(false);

	/** The single `Pending` for the page, passed down to every row and panel. */
	const pending = new Pending();

	// The one `formToasts` call, on the component that owns `form`.
	formToasts(() => form, {
		setRole: 'Role updated',
		setAssignedOlympiads: 'Assignments saved',
		banUser: 'User banned',
		unbanUser: 'User unbanned',
		ensureIndex: 'Search index rebuilt',
		optimizeIndex: 'Index segments merged',
		// Names the count the action returns, so a prune that found nothing says so
		// instead of claiming rows were removed (docs/search.md, "Prune orphans").
		pruneIndex: ({ pruned }) =>
			typeof pruned === 'number' && pruned > 0
				? `Removed ${plural(pruned, 'orphaned index row')}`
				: 'No orphaned index rows to remove'
	});
</script>

<SvelteSeo title="Admin — phoXiv" description="phoXiv admin panel" />

<PageHeader
	title="Admin"
	description="Manage user roles and access, and review the activity log."
/>

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
		<ActivityLogTable log={data.log} hasMore={data.hasMore} />
	</Tabs.Content>

	<Tabs.Content value="index">
		{#if indexSeen}
			<IndexPanel {pending} />
		{/if}
	</Tabs.Content>
</Tabs.Root>
