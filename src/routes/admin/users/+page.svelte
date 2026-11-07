<script lang="ts">
	import type { PageProps } from './$types';
	import SvelteSeo from 'svelte-seo';
	import { resolve } from '$app/paths';
	import BackLink from '#lib/components/BackLink.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import { formToasts, Pending } from '#lib/forms.svelte.js';
	import UsersTable from './UsersTable.svelte';

	let { data, form }: PageProps = $props();

	/** The single `Pending` for the page, passed down to every row. */
	const pending = new Pending();

	// The one `formToasts` call, on the component that owns `form`.
	formToasts(() => form, {
		setRole: 'Role updated',
		setAssignedOlympiads: 'Assignments saved',
		banUser: 'User banned',
		unbanUser: 'User unbanned'
	});
</script>

<SvelteSeo title="Users — Admin — phoXiv" description="phoXiv admin panel" />

<BackLink href={resolve('admin')}>Back to admin</BackLink>

<PageHeader title="Users" description="Roles, olympiad assignments and bans." />

<UsersTable users={data.users} olympiads={data.olympiads} currentUserId={data.user?.id} {pending} />
