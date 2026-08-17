<script lang="ts">
	import type { PageData } from './$types';
	import type { Pending } from '$lib/forms.svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { FlexRender, createSvelteTable } from '$lib/components/ui/data-table/index.js';
	import { ChevronUp, ChevronDown, ChevronsUpDown } from '@lucide/svelte';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import UserRowActions from './UserRowActions.svelte';
	import { globalFilterFn, userColumns } from './columns';
	import { formatDate } from '$lib/utils/date';
	import { parseStringArray } from '$lib/utils/json';
	import { roleLabel, roleVariant } from '$lib/activity';
	import {
		getCoreRowModel,
		getSortedRowModel,
		getFilteredRowModel,
		type SortingState,
		type ColumnFiltersState
	} from '@tanstack/table-core';

	/**
	 * The users table: search and role filter, sortable headers, and one
	 * `UserRowActions` per row.
	 */
	let {
		users,
		olympiads,
		currentUserId,
		pending
	}: {
		users: PageData['users'];
		olympiads: PageData['olympiads'];
		/** The acting admin, whose own row gets no action controls. */
		currentUserId: string | undefined;
		/** The page's single tracker, shared by every row. */
		pending: Pending;
	} = $props();

	let globalFilter = $state('');
	let roleFilter = $state('all');
	let sorting = $state<SortingState>([]);
	const columnFilters = $derived<ColumnFiltersState>(
		roleFilter !== 'all' ? [{ id: 'role', value: roleFilter }] : []
	);

	/** The dropdown's label for the filter currently applied. */
	const ROLE_FILTERS: Record<string, string> = {
		all: 'All users',
		admin: 'Admins',
		contributor: 'Contributors',
		banned: 'Banned'
	};

	/**
	 * Every option here is a getter on purpose: that laziness is what makes the
	 * table re-read `users`, `sorting` and the filters as they change. Passing
	 * plain values would freeze the table at its construction-time snapshot.
	 */
	const table = createSvelteTable({
		get data() {
			return users;
		},
		columns: userColumns,
		// Row ids default to the index in `data`, which would silently re-pair a
		// keyed `{#each}` block with a different user as soon as a row is inserted
		// or removed. Keying on the user id makes the mapping stable.
		getRowId: (u) => u.id,
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
		globalFilterFn
	});
</script>

<!-- Toolbar -->
<div class="mb-4 flex flex-wrap items-center gap-3">
	<Input
		placeholder="Search users…"
		value={globalFilter}
		oninput={(e) => (globalFilter = (e.currentTarget as HTMLInputElement).value)}
		class="max-w-xs"
	/>
	<Select.Root type="single" bind:value={roleFilter}>
		<Select.Trigger class="w-36">{ROLE_FILTERS[roleFilter]}</Select.Trigger>
		<Select.Content>
			<Select.Item value="all">All users</Select.Item>
			<Select.Item value="admin">Admins only</Select.Item>
			<Select.Item value="contributor">Contributors only</Select.Item>
			<Select.Item value="banned">Banned only</Select.Item>
		</Select.Content>
	</Select.Root>
	<span class="ml-auto text-xs text-muted-foreground">
		{table.getFilteredRowModel().rows.length} / {users.length} users
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
				{@const assignedIds = parseStringArray(u.assignedOlympiads)}

				<Table.Row class={u.banned ? 'opacity-50' : ''}>
					<!-- User cell — rendered manually for the avatar+badge treatment -->
					<Table.Cell>
						<div class="flex items-center gap-2.5">
							<UserAvatar user={u} class="size-8 ring-2 ring-border" iconClass="size-3.5" />
							<div class="flex min-w-0 flex-col gap-0.5">
								<div class="flex flex-wrap items-center gap-1.5">
									<span class="font-medium text-foreground">{u.name}</span>
									{#if u.id === currentUserId}
										<Badge variant="secondary" class="px-1.5 py-0 text-xs">You</Badge>
									{/if}
								</div>
								{#if u.banned && u.banReason}
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
							<Badge variant={roleVariant(u.role)} class="text-xs">{roleLabel(u.role)}</Badge>
							{#if u.role === 'contributor'}
								<Badge variant="outline" class="text-xs">
									{assignedIds.length}
									{assignedIds.length === 1 ? 'olympiad' : 'olympiads'}
								</Badge>
							{/if}
							{#if u.banned}
								<Badge variant="destructive" class="text-xs">Banned</Badge>
							{/if}
						</div>
					</Table.Cell>

					<!-- Joined date -->
					<Table.Cell class="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
						{formatDate(u.createdAt, 'short')}
					</Table.Cell>

					<!-- Actions -->
					<Table.Cell>
						{#if u.id !== currentUserId}
							<UserRowActions user={u} {olympiads} {pending} />
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
