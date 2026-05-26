<script lang="ts">
	import type { PageProps } from './$types';
	import { enhance } from '$app/forms';
	import SvelteSeo from 'svelte-seo';
	import Title from '$lib/components/Title.svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { FlexRender, createSvelteTable } from '$lib/components/ui/data-table/index.js';
	import {
		User,
		Shield,
		Ban,
		CircleCheck,
		ChevronUp,
		ChevronDown,
		ChevronsUpDown
	} from '@lucide/svelte';
	import { toast } from 'svelte-sonner';
	import {
		getCoreRowModel,
		getSortedRowModel,
		getFilteredRowModel,
		type ColumnDef,
		type SortingState,
		type ColumnFiltersState
	} from '@tanstack/table-core';

	let { data, form }: PageProps = $props();

	type UserRow = (typeof data.users)[number];

	// ── Action state ──────────────────────────────────────────────────────────
	let submitting = $state<Record<string, boolean>>({});

	$effect(() => {
		if (!form) return;
		if ('success' in form && form.success) toast.success('User updated');
		if ('error' in form && form.error) toast.error(String(form.error));
	});

	// ── Table state ───────────────────────────────────────────────────────────
	let globalFilter = $state('');
	let roleFilter = $state('all');
	let sorting = $state<SortingState>([]);
	const columnFilters = $derived<ColumnFiltersState>(
		roleFilter !== 'all' ? [{ id: 'role', value: roleFilter }] : []
	);

	// ── Column definitions ────────────────────────────────────────────────────
	const columns: ColumnDef<UserRow>[] = [
		{
			id: 'name',
			accessorKey: 'name',
			header: 'User',
			enableSorting: true
		},
		{
			accessorKey: 'email',
			header: 'Email',
			enableSorting: true
		},
		{
			id: 'role',
			accessorKey: 'role',
			header: 'Role',
			enableSorting: true,
			filterFn: (row, _id, filterValue) => {
				if (filterValue === 'admin') return row.original.role === 'admin';
				if (filterValue === 'banned') return !!row.original.banned;
				return true;
			}
		},
		{
			id: 'joined',
			accessorFn: (row) => row.createdAt,
			header: 'Joined',
			sortingFn: 'datetime',
			enableSorting: true
		}
	];

	// ── Table instance ────────────────────────────────────────────────────────
	const table = createSvelteTable({
		get data() {
			return data.users;
		},
		columns,
		state: {
			get sorting() {
				return sorting;
			},
			get globalFilter() {
				return globalFilter;
			},
			get columnFilters() {
				return columnFilters;
			}
		},
		onSortingChange: (updater) => {
			sorting = typeof updater === 'function' ? updater(sorting) : updater;
		},
		onGlobalFilterChange: (updater) => {
			globalFilter = typeof updater === 'function' ? updater(globalFilter) : updater;
		},
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		globalFilterFn: (row, _columnId, filterValue) => {
			const q = String(filterValue).toLowerCase();
			const u = row.original;
			return (
				u.name.toLowerCase().includes(q) ||
				u.email.toLowerCase().includes(q) ||
				(u.role ?? '').toLowerCase().includes(q)
			);
		}
	});

	function formatDate(date: Date | string | null) {
		if (!date) return '—';
		return new Date(date).toLocaleDateString('en-GB', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}
</script>

<SvelteSeo title="Admin — phoXiv" description="phoXiv admin panel" />

<Title title="Admin" description="Manage user roles and access." />

<!-- Toolbar -->
<div class="mb-4 flex flex-wrap items-center gap-3">
	<Input
		placeholder="Search users…"
		value={globalFilter}
		oninput={(e) => (globalFilter = (e.currentTarget as HTMLInputElement).value)}
		class="max-w-xs"
	/>
	<Select.Root type="single" bind:value={roleFilter}>
		<Select.Trigger class="w-36">
			{roleFilter === 'all' ? 'All users' : roleFilter === 'admin' ? 'Admins' : 'Banned'}
		</Select.Trigger>
		<Select.Content>
			<Select.Item value="all">All users</Select.Item>
			<Select.Item value="admin">Admins only</Select.Item>
			<Select.Item value="banned">Banned only</Select.Item>
		</Select.Content>
	</Select.Root>
	<span class="ml-auto text-xs text-muted-foreground">
		{table.getFilteredRowModel().rows.length} / {data.users.length} users
	</span>
</div>

<!-- Data table -->
<div class="overflow-hidden rounded-2xl border border-border bg-card ring-1 ring-foreground/5">
	<Table.Root>
		<Table.Header>
			{#each table.getHeaderGroups() as headerGroup (headerGroup.id)}
				<Table.Row class="hover:bg-transparent">
					{#each headerGroup.headers as header (header.id)}
						<Table.Head
							class={header.column.getCanSort() ? 'cursor-pointer select-none' : ''}
							onclick={header.column.getCanSort()
								? header.column.getToggleSortingHandler()
								: undefined}
						>
							{#if !header.isPlaceholder}
								<div class="flex items-center gap-1.5">
									<FlexRender
										content={header.column.columnDef.header}
										context={header.getContext()}
									/>
									{#if header.column.getCanSort()}
										{#if header.column.getIsSorted() === 'asc'}
											<ChevronUp class="size-3.5 text-primary" />
										{:else if header.column.getIsSorted() === 'desc'}
											<ChevronDown class="size-3.5 text-primary" />
										{:else}
											<ChevronsUpDown class="size-3.5 opacity-40" />
										{/if}
									{/if}
								</div>
							{/if}
						</Table.Head>
					{/each}
					<!-- Actions column header — not managed by TanStack -->
					<Table.Head class="text-right">Actions</Table.Head>
				</Table.Row>
			{/each}
		</Table.Header>

		<Table.Body>
			{#each table.getRowModel().rows as row (row.id)}
				{@const u = row.original}
				{@const isSelf = u.id === data.user?.id}
				{@const isAdmin = u.role === 'admin'}
				{@const isBanned = u.banned}

				<Table.Row class={isBanned ? 'opacity-50' : ''}>
					<!-- User cell — rendered manually for the avatar+badge treatment -->
					<Table.Cell>
						<div class="flex items-center gap-2.5">
							{#if u.image}
								<img
									src={u.image}
									alt={u.name}
									class="size-8 shrink-0 rounded-full ring-2 ring-border"
								/>
							{:else}
								<div
									class="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted ring-2 ring-border"
								>
									<User class="size-3.5 text-muted-foreground" />
								</div>
							{/if}
							<div class="flex min-w-0 flex-col gap-0.5">
								<div class="flex flex-wrap items-center gap-1.5">
									<span class="font-medium text-foreground">{u.name}</span>
									{#if isSelf}
										<Badge variant="secondary" class="px-1.5 py-0 text-xs">You</Badge>
									{/if}
								</div>
								{#if isBanned && u.banReason}
									<span class="truncate text-xs text-destructive">Banned: {u.banReason}</span>
								{/if}
							</div>
						</div>
					</Table.Cell>

					<!-- Email -->
					<Table.Cell class="max-w-50 truncate text-muted-foreground">
						{u.email}
					</Table.Cell>

					<!-- Role / status badges -->
					<Table.Cell>
						<div class="flex flex-wrap gap-1">
							{#if isAdmin}
								<Badge variant="default" class="text-xs">Admin</Badge>
							{:else}
								<Badge variant="outline" class="text-xs">User</Badge>
							{/if}
							{#if isBanned}
								<Badge variant="destructive" class="text-xs">Banned</Badge>
							{/if}
						</div>
					</Table.Cell>

					<!-- Joined date -->
					<Table.Cell class="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
						{formatDate(u.createdAt)}
					</Table.Cell>

					<!-- Actions -->
					<Table.Cell>
						{#if !isSelf}
							<div class="flex items-center justify-end gap-2">
								<!-- Toggle admin role -->
								<form
									method="POST"
									action="?/setRole"
									use:enhance={() => {
										submitting[u.id + '_role'] = true;
										return async ({ update }) => {
											submitting[u.id + '_role'] = false;
											await update();
										};
									}}
								>
									<input type="hidden" name="userId" value={u.id} />
									<input type="hidden" name="role" value={isAdmin ? 'user' : 'admin'} />
									<Button
										type="submit"
										variant={isAdmin ? 'outline' : 'default'}
										size="xs"
										disabled={submitting[u.id + '_role']}
									>
										<Shield class="size-3" />
										{isAdmin ? 'Demote' : 'Make admin'}
									</Button>
								</form>

								<Separator orientation="vertical" class="h-5" />

								<!-- Ban / Unban -->
								{#if isBanned}
									<form
										method="POST"
										action="?/unbanUser"
										use:enhance={() => {
											submitting[u.id + '_ban'] = true;
											return async ({ update }) => {
												submitting[u.id + '_ban'] = false;
												await update();
											};
										}}
									>
										<input type="hidden" name="userId" value={u.id} />
										<Button
											type="submit"
											variant="outline"
											size="xs"
											disabled={submitting[u.id + '_ban']}
										>
											<CircleCheck class="size-3" />
											Unban
										</Button>
									</form>
								{:else}
									<form
										method="POST"
										action="?/banUser"
										use:enhance={() => {
											submitting[u.id + '_ban'] = true;
											return async ({ update }) => {
												submitting[u.id + '_ban'] = false;
												await update();
											};
										}}
									>
										<input type="hidden" name="userId" value={u.id} />
										<input type="hidden" name="reason" value="" />
										<Button
											type="submit"
											variant="destructive"
											size="xs"
											disabled={submitting[u.id + '_ban']}
										>
											<Ban class="size-3" />
											Ban
										</Button>
									</form>
								{/if}
							</div>
						{/if}
					</Table.Cell>
				</Table.Row>
			{/each}

			{#if table.getFilteredRowModel().rows.length === 0}
				<Table.Row>
					<Table.Cell colspan={5} class="py-12 text-center text-sm text-muted-foreground">
						No users match your filters.
					</Table.Cell>
				</Table.Row>
			{/if}
		</Table.Body>
	</Table.Root>
</div>
