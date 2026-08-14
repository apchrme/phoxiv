import type { ColumnDef, FilterFn } from '@tanstack/table-core';
import type { PageData } from './$types';

/**
 * The TanStack column model behind the users table.
 *
 * Only the sorting and filtering behaviour lives here — every cell is rendered
 * by hand in `UsersTable.svelte`, because the user column needs an avatar and
 * badges and the role column needs several. TanStack is used for the row model,
 * not for the markup, so these definitions carry no `cell` renderers.
 */

/** One row of the users table. */
export type UserRow = PageData['users'][number];

export const userColumns: ColumnDef<UserRow>[] = [
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
		// "Banned" is a status rather than a role, but it shares the toolbar's
		// single dropdown, so it is resolved here rather than as its own filter.
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

/** Free-text search across the three columns worth searching. */
export const globalFilterFn: FilterFn<UserRow> = (row, _columnId, filterValue) => {
	const q = String(filterValue).toLowerCase();
	const u = row.original;
	return (
		u.name.toLowerCase().includes(q) ||
		u.email.toLowerCase().includes(q) ||
		(u.role ?? '').toLowerCase().includes(q)
	);
};
