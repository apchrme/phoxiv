import type { ColumnDef, FilterFn } from '@tanstack/table-core';
import type { PageData } from './$types';

/**
 * The users table's column model: sorting and filtering only. Cells are
 * rendered by hand in `UsersTable.svelte`, so there are no `cell` renderers.
 */

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
		// "Banned" is a status, not a role, but shares the role dropdown.
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

/** Free-text search over name, email and role. */
export const globalFilterFn: FilterFn<UserRow> = (row, _columnId, filterValue) => {
	const q = String(filterValue).toLowerCase();
	const u = row.original;
	return (
		u.name.toLowerCase().includes(q) ||
		u.email.toLowerCase().includes(q) ||
		(u.role ?? '').toLowerCase().includes(q)
	);
};
