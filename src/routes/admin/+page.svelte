<script lang="ts">
	import type { PageProps } from './$types';
	import SvelteSeo from 'svelte-seo';
	import Title from '$lib/components/Title.svelte';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { formToasts, Pending } from '$lib/forms.svelte';
	import UsersTable from './UsersTable.svelte';
	import ActivityLogTable from './ActivityLogTable.svelte';

	let { data, form }: PageProps = $props();

	let tab = $state('users');

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
		unbanUser: 'User unbanned'
	});
</script>

<SvelteSeo title="Admin — phoXiv" description="phoXiv admin panel" />

<Title title="Admin" description="Manage user roles and access, and view 100 most recent logs." />

<Tabs.Root bind:value={tab} class="gap-4">
	<Tabs.List>
		<Tabs.Trigger value="users">Users</Tabs.Trigger>
		<Tabs.Trigger value="log">Log</Tabs.Trigger>
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
</Tabs.Root>
