<script lang="ts">
	import type { PageProps } from './$types';
	import { enhance } from '$app/forms';
	import SvelteSeo from 'svelte-seo';
	import Title from '$lib/components/Title.svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button, buttonVariants } from '$lib/components/ui/button/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { FlexRender, createSvelteTable } from '$lib/components/ui/data-table/index.js';
	import {
		User,
		Ban,
		CircleCheck,
		ChevronUp,
		ChevronDown,
		ChevronsUpDown,
		BookOpenCheck
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
				if (filterValue === 'contributor') return row.original.role === 'contributor';
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

	function parseAssigned(assignedOlympiads: string): string[] {
		try {
			const parsed = JSON.parse(assignedOlympiads || '[]');
			return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
		} catch {
			return [];
		}
	}

	// Local, per-user draft of checked olympiad IDs while the assign dropdown is open.
	// Seeded lazily from the row's current assignment when first opened.
	let assignDrafts = $state<Record<string, string[]>>({});

	function openAssignDropdown(u: UserRow) {
		if (!(u.id in assignDrafts)) {
			assignDrafts[u.id] = parseAssigned(u.assignedOlympiads);
		}
	}

	function toggleAssigned(userId: string, olympiadId: string, checked: boolean) {
		const current = assignDrafts[userId] ?? [];
		assignDrafts[userId] = checked
			? [...current, olympiadId]
			: current.filter((id) => id !== olympiadId);
	}

	// Local, per-user draft of the selected role. Deliberately NOT bound to
	// `u.role` directly — a select wired straight to reactive server data plus
	// an auto-submitting onValueChange caused an infinite submit loop (the
	// post-submit reload re-supplied `value`, which re-fired onValueChange,
	// which submitted again, forever). Draft state + an explicit Save button
	// avoids that entirely.
	let roleDrafts = $state<Record<string, string>>({});

	function currentRoleDraft(u: UserRow): string {
		return roleDrafts[u.id] ?? u.role ?? 'user';
	}

	function roleLabel(role: string): string {
		if (role === 'admin') return 'Admin';
		if (role === 'contributor') return 'Contributor';
		return 'User';
	}

	// ── Activity log helpers ──────────────────────────────────────────────────
	let activeAdminTab = $state('users');

	function formatDateTime(date: Date | string) {
		return new Date(date).toLocaleString('en-GB', {
			day: 'numeric',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	const actionLabels: Record<string, string> = {
		create_olympiad: 'Created olympiad',
		update_olympiad: 'Updated metadata',
		upload_icon: 'Uploaded icon',
		remove_icon: 'Removed icon',
		add_year: 'Added year',
		delete_year: 'Deleted year',
		save_metadata: 'Saved year metadata',
		upload_file: 'Uploaded file',
		delete_file: 'Deleted file',
		import_titles: 'Imported problem titles'
	};

	function actionVariant(action: string): 'default' | 'secondary' | 'destructive' | 'outline' {
		if (action.startsWith('delete')) return 'destructive';
		if (action.startsWith('create') || action.startsWith('add')) return 'default';
		return 'secondary';
	}
</script>

<SvelteSeo title="Admin — phoXiv" description="phoXiv admin panel" />

<Title title="Admin" description="Manage user roles and access, and view 100 most recent logs." />

<Tabs.Root bind:value={activeAdminTab} class="gap-4">
	<Tabs.List>
		<Tabs.Trigger value="users">Users</Tabs.Trigger>
		<Tabs.Trigger value="log">Log</Tabs.Trigger>
	</Tabs.List>

	<Tabs.Content value="users">
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
					{roleFilter === 'all'
						? 'All users'
						: roleFilter === 'admin'
							? 'Admins'
							: roleFilter === 'contributor'
								? 'Contributors'
								: 'Banned'}
				</Select.Trigger>
				<Select.Content>
					<Select.Item value="all">All users</Select.Item>
					<Select.Item value="admin">Admins only</Select.Item>
					<Select.Item value="contributor">Contributors only</Select.Item>
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
						{@const isContributor = u.role === 'contributor'}
						{@const isBanned = u.banned}
						{@const assignedIds = parseAssigned(u.assignedOlympiads)}

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
									{:else if isContributor}
										<Badge variant="secondary" class="text-xs">Contributor</Badge>
										<Badge variant="outline" class="text-xs">
											{assignedIds.length}
											{assignedIds.length === 1 ? 'olympiad' : 'olympiads'}
										</Badge>
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
									{@const draft = currentRoleDraft(u)}
									{@const dirty = draft !== (u.role ?? '')}
									<div class="flex flex-wrap items-center justify-end gap-2">
										<!-- Role select -->
										<form
											method="POST"
											action="?/setRole"
											use:enhance={() => {
												submitting[u.id + '_role'] = true;
												return async ({ update }) => {
													submitting[u.id + '_role'] = false;
													// Clear the local draft so the row falls back to reading
													// straight from the (now-updated) server data again.
													delete roleDrafts[u.id];
													await update();
												};
											}}
											class="flex items-center gap-1.5"
										>
											<input type="hidden" name="userId" value={u.id} />
											<input type="hidden" name="role" value={draft} />
											<Select.Root
												type="single"
												value={draft}
												onValueChange={(v) => (roleDrafts[u.id] = v)}
											>
												<Select.Trigger
													class="h-8 w-32 text-xs"
													disabled={submitting[u.id + '_role']}
												>
													{roleLabel(draft)}
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
												variant={dirty ? 'default' : 'outline'}
												disabled={submitting[u.id + '_role'] || !dirty}
											>
												Save
											</Button>
										</form>

										<!-- Assign olympiads — contributors only -->
										{#if isContributor}
											<DropdownMenu.Root
												onOpenChange={(open) => {
													if (open) openAssignDropdown(u);
												}}
											>
												<DropdownMenu.Trigger
													class={buttonVariants({ variant: 'outline', size: 'xs' })}
												>
													<BookOpenCheck class="size-3" />
													Assign
												</DropdownMenu.Trigger>
												<DropdownMenu.Content align="end" class="max-h-72 w-56 overflow-y-auto">
													<DropdownMenu.Label>Assigned olympiads</DropdownMenu.Label>
													<DropdownMenu.Separator />
													{#each data.olympiads as o (o.id)}
														{@const draft = assignDrafts[u.id] ?? assignedIds}
														{@const checked = draft.includes(o.id)}
														<label
															class="flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-sm select-none hover:bg-accent"
														>
															<input
																type="checkbox"
																{checked}
																onchange={(e) =>
																	toggleAssigned(
																		u.id,
																		o.id,
																		(e.currentTarget as HTMLInputElement).checked
																	)}
															/>
															{o.name}
														</label>
													{/each}
													<DropdownMenu.Separator />
													<form
														method="POST"
														action="?/setAssignedOlympiads"
														use:enhance={() => {
															submitting[u.id + '_assign'] = true;
															return async ({ update }) => {
																submitting[u.id + '_assign'] = false;
																await update();
															};
														}}
														class="px-1 pb-1"
													>
														<input type="hidden" name="userId" value={u.id} />
														{#each assignDrafts[u.id] ?? assignedIds as olympiadId (olympiadId)}
															<input type="hidden" name="olympiadId" value={olympiadId} />
														{/each}
														<Button
															type="submit"
															size="xs"
															class="w-full"
															disabled={submitting[u.id + '_assign']}
														>
															Save assignments
														</Button>
													</form>
												</DropdownMenu.Content>
											</DropdownMenu.Root>
										{/if}

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
	</Tabs.Content>

	<Tabs.Content value="log">
		<div class="overflow-hidden rounded-2xl border border-border bg-card ring-1 ring-foreground/5">
			<Table.Root>
				<Table.Header>
					<Table.Row class="hover:bg-transparent">
						<Table.Head>Time</Table.Head>
						<Table.Head>User</Table.Head>
						<Table.Head>Action</Table.Head>
						<Table.Head>Details</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each data.log as entry (entry.id)}
						<Table.Row>
							<Table.Cell class="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
								{formatDateTime(entry.createdAt)}
							</Table.Cell>
							<Table.Cell class="font-medium">{entry.userName}</Table.Cell>
							<Table.Cell>
								<Badge variant={actionVariant(entry.action)} class="text-xs">
									{actionLabels[entry.action] ?? entry.action}
								</Badge>
							</Table.Cell>
							<Table.Cell class="max-w-md text-muted-foreground">
								{entry.detail}
								{#if entry.olympiadId}
									<span class="ml-1 font-mono text-xs text-foreground">
										{entry.olympiadId}{entry.year ? `/${entry.year}` : ''}
									</span>
								{/if}
							</Table.Cell>
						</Table.Row>
					{/each}
					{#if data.log.length === 0}
						<Table.Row>
							<Table.Cell colspan={4} class="py-12 text-center text-sm text-muted-foreground">
								No activity recorded yet.
							</Table.Cell>
						</Table.Row>
					{/if}
				</Table.Body>
			</Table.Root>
		</div>
	</Tabs.Content>
</Tabs.Root>
