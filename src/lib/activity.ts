/* Display helpers for the admin panel. Action names come from the `activityLog.action` enum in schema.ts. */

/** Human-readable label for each logged action. */
export const ACTION_LABELS: Record<string, string> = {
	create_olympiad: 'Created olympiad',
	update_olympiad: 'Updated metadata',
	upload_icon: 'Uploaded icon',
	remove_icon: 'Removed icon',
	add_year: 'Added year',
	delete_year: 'Deleted year',
	save_metadata: 'Saved year metadata',
	upload_file: 'Uploaded file',
	delete_file: 'Deleted file',
	import_titles: 'Imported problem titles',
	index_files: 'Indexed file text'
};

/** `ACTION_LABELS[action]`, falling back to the raw name for unknown actions. */
export function actionLabel(action: string): string {
	return ACTION_LABELS[action] ?? action;
}

/** Badge colour for an action, from its verb prefix. */
export function actionVariant(action: string): 'default' | 'secondary' | 'destructive' | 'outline' {
	if (action.startsWith('delete')) return 'destructive';
	if (action.startsWith('create') || action.startsWith('add')) return 'default';
	return 'secondary';
}

/**
 * Roles offered in the admin dropdown, in order. `setRole` also accepts `''`
 * (clear to NULL), which is not offered here.
 */
export const ASSIGNABLE_ROLES = ['user', 'contributor', 'admin'] as const;

/** Human-readable label for a user role. */
export function roleLabel(role: string | null | undefined): string {
	if (role === 'admin') return 'Admin';
	if (role === 'contributor') return 'Contributor';
	return 'User';
}

/** Badge colour for a role. */
export function roleVariant(
	role: string | null | undefined
): 'default' | 'secondary' | 'destructive' | 'outline' {
	if (role === 'admin') return 'default';
	if (role === 'contributor') return 'secondary';
	return 'outline';
}
