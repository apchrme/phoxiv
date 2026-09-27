<script lang="ts">
	import type { PageData } from './$types';
	import type { Pending } from '$lib/forms.svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { FlexRender, createSvelteTable } from '$lib/components/ui/data-table/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import { ChevronUp, ChevronDown, ChevronsUpDown, UsersRound } from '@lucide/svelte';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import OlympiadIcon from '$lib/components/OlympiadIcon.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { plural } from '$lib/utils/plural';
	import UserRowActions from './UserRowActions.svelte';
	import { globalFilterFn, userColumns } from './columns';
	import { formatDate } from '$lib/utils/date';
	import { parseStringArray } from '$lib/utils/json';
	import { roleLabel, roleVariant } from '$lib/activity';
	import {
		getCoreRowModel,
		getSortedRowModel,
		getFilteredRowModel,
		getPaginationRowModel,
		type SortingState,
		type ColumnFiltersState,
		type PaginationState
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
		/** The page's single `Pending`, shared by every row. */
		pending: Pending;
	} = $props();

	let globalFilter = $state('');
	let roleFilter = $state('all');
	/**
	 * Oldest-first by join date. Sorted here, not with `ORDER BY` in the load,
	 * because `user.createdAt` has no index and D1 would bill the sort.
	 */
	let sorting = $state<SortingState>([{ id: 'joined', desc: false }]);
	let pagination = $state<PaginationState>({ pageIndex: 0, pageSize: 25 });

	/**
	 * Back to page 1, called by search, role filter and sorting. TanStack's
	 * `autoResetPageIndex` is off because it also fires when an action reloads
	 * `users`, which would jump the admin back to page 1 mid-task.
	 */
	function toFirstPage() {
		pagination = { ...pagination, pageIndex: 0 };
	}
	const columnFilters = $derived<ColumnFiltersState>(
		roleFilter !== 'all' ? [{ id: 'role', value: roleFilter }] : []
	);

	/** The trigger label for the applied filter. */
	const ROLE_FILTERS: Record<string, string> = {
		all: 'All users',
		admin: 'Admins',
		contributor: 'Contributors',
		banned: 'Banned'
	};

	/** Options are getters so the table sees changes; plain values would freeze it. */
	const table = createSvelteTable({
		get data() {
			return users;
		},
		columns: userColumns,
		// Default row ids are indexes, which would re-pair keyed rows with the
		// wrong user after an insert or delete.
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
			},
			get pagination() {
				return pagination;
			}
		},
		onSortingChange: (updater) => {
			sorting = typeof updater === 'function' ? updater(sorting) : updater;
			toFirstPage();
		},
		onGlobalFilterChange: (updater) => {
			globalFilter = typeof updater === 'function' ? updater(globalFilter) : updater;
			toFirstPage();
		},
		onPaginationChange: (updater) => {
			pagination = typeof updater === 'function' ? updater(pagination) : updater;
		},
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		// Client-side paging only limits DOM rows; it saves no D1 reads. Server
		// paging would need a D1 query per search keystroke.
		getPaginationRowModel: getPaginationRowModel(),
		// See `toFirstPage`.
		autoResetPageIndex: false,
		globalFilterFn
	});
</script>

<!-- Toolbar -->
<div class="mb-4 flex flex-wrap items-center gap-3">
	<Input
		placeholder="Search users…"
		value={globalFilter}
		oninput={(e) => {
			globalFilter = (e.currentTarget as HTMLInputElement).value;
			toFirstPage();
		}}
		class="max-w-xs"
	/>
	<Select.Root
		type="single"
		value={roleFilter}
		onValueChange={(v) => {
			roleFilter = v;
			toFirstPage();
		}}
	>
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

					<Table.Cell class="max-w-50 truncate text-muted-foreground">
						{u.email}
					</Table.Cell>

					<!-- Role / status badges -->
					<Table.Cell>
						<div class="flex flex-wrap gap-1">
							<Badge variant={roleVariant(u.role)} class="text-xs">{roleLabel(u.role)}</Badge>
							{#if u.role === 'contributor'}
								<!-- The tooltip lists which olympiads. The root layout's
								     `Sidebar.Provider` supplies the `Tooltip.Provider`. -->
								<Tooltip.Root>
									<Tooltip.Trigger>
										<Badge variant="outline" class="text-xs">
											{plural(assignedIds.length, 'olympiad')}
										</Badge>
									</Tooltip.Trigger>
									<Tooltip.Content class="max-w-56">
										{#if assignedIds.length === 0}
											<span class="text-xs">No olympiads assigned yet</span>
										{:else}
											<!-- Looked up in `olympiads`, so ids of deleted olympiads drop out. -->
											<ul class="flex flex-col gap-1">
												{#each olympiads.filter((o) => assignedIds.includes(o.id)) as o (o.id)}
													<li class="flex items-center gap-1.5 text-xs">
														<OlympiadIcon icon={o.icon} id={o.id} size="sm" />
														{o.name}
													</li>
												{/each}
											</ul>
										{/if}
									</Tooltip.Content>
								</Tooltip.Root>
							{/if}
							{#if u.banned}
								<Badge variant="destructive" class="text-xs">Banned</Badge>
							{/if}
						</div>
					</Table.Cell>

					<Table.Cell class="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
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
					<!-- `boxed={false}`: the table already has edges. -->
					<Table.Cell colspan={5} class="py-12">
						<EmptyState
							boxed={false}
							icon={UsersRound}
							message="No users found"
							hint="Try a different search term, or clear the role filter."
						/>
					</Table.Cell>
				</Table.Row>
			{/if}
		</Table.Body>

		<!-- Hand-built pager. Don't add shadcn's `pagination` via the CLI (CLAUDE.md rule 2). -->
		{#if table.getPageCount() > 1}
			<Table.Footer>
				<Table.Row class="hover:bg-transparent">
					<Table.Cell colspan={5}>
						<div class="flex items-center justify-end gap-3">
							<span class="text-xs font-normal text-muted-foreground">
								Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
							</span>
							<Button
								variant="outline"
								size="sm"
								onclick={() => table.previousPage()}
								disabled={!table.getCanPreviousPage()}
							>
								Previous
							</Button>
							<Button
								variant="outline"
								size="sm"
								onclick={() => table.nextPage()}
								disabled={!table.getCanNextPage()}
							>
								Next
							</Button>
						</div>
					</Table.Cell>
				</Table.Row>
			</Table.Footer>
		{/if}
	</Table.Root>
</div>
