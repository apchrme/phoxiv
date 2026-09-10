<script lang="ts">
	import type { PageData } from './$types';
	import type { Pending } from '$lib/forms.svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { FlexRender, createSvelteTable } from '$lib/components/ui/data-table/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
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
		/** The page's single tracker, shared by every row. */
		pending: Pending;
	} = $props();

	let globalFilter = $state('');
	let roleFilter = $state('all');
	/**
	 * Oldest-first by join date, matching what the page showed when the load
	 * carried an `ORDER BY user.createdAt`.
	 *
	 * That `ORDER BY` had no supporting index — `user` carries only
	 * `user_email_unique` — so D1 paid a sort: 224 rows read where the bare scan
	 * reads 112. Sorting here instead is free, because `getSortedRowModel` was
	 * already running over the whole array for the sortable headers.
	 */
	let sorting = $state<SortingState>([{ id: 'joined', desc: false }]);
	let pagination = $state<PaginationState>({ pageIndex: 0, pageSize: 25 });

	/**
	 * Back to page 1, called from every control that changes *which* rows exist.
	 *
	 * TanStack would do this itself — `autoResetPageIndex` defaults on — but it
	 * keys off the row model recomputing, which also happens when the `users`
	 * prop merely changes identity. `setRole` and `banUser` run the default
	 * `invalidateAll`, so the load re-runs and hands down a fresh array: with the
	 * automatic reset on, changing a role on page 3 threw the admin back to page
	 * 1 mid-task. It is off, and the three controls that genuinely need it call
	 * this instead.
	 */
	function toFirstPage() {
		pagination = { ...pagination, pageIndex: 0 };
	}
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
		// **Purely a rendering change — it saves no D1 rows.** Filtering and
		// sorting already run over the whole `users` array client-side and the
		// toolbar counter reads `users.length`, so this only bounds how many rows
		// reach the DOM. Server-paging would cost more than it saved: the search
		// box and role filter would have to move server-side, buying a debounced
		// D1 query per keystroke in exchange for ~100 rows.
		getPaginationRowModel: getPaginationRowModel(),
		// See `toFirstPage` — the automatic reset fires on a load re-run too.
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
					<Table.Cell colspan={5} class="py-12 text-center text-sm text-muted-foreground">
						No users match your filters.
					</Table.Cell>
				</Table.Row>
			{/if}
		</Table.Body>

		<!--
			Prev/next and a page counter, built from the vendored Button. There is
			deliberately no shadcn-svelte `pagination` component: `components.json`
			points at a live registry, so a CLI run over `src/lib/components/ui/`
			would pull today's upstream over ~40 commits of local customisation
			(CLAUDE.md rule 2). This needs two buttons.
		-->
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
