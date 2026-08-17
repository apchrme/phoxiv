/**
 * Presentation of activity-log entries.
 *
 * Client-safe so the admin panel can import it. The action names themselves are
 * defined once by the `activityLog.action` enum in
 * `$lib/server/db/schema.ts`, from which `LogAction` in
 * `$lib/server/activity-log.ts` is derived.
 */

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
	import_titles: 'Imported problem titles'
};

/** `ACTION_LABELS[action]`, falling back to the raw name for unknown actions. */
export function actionLabel(action: string): string {
	return ACTION_LABELS[action] ?? action;
}

/**
 * Badge colour for an action, keyed off its verb prefix so a newly added action
 * is styled sensibly without touching this file.
 */
export function actionVariant(action: string): 'default' | 'secondary' | 'destructive' | 'outline' {
	if (action.startsWith('delete')) return 'destructive';
	if (action.startsWith('create') || action.startsWith('add')) return 'default';
	return 'secondary';
}

/**
 * The roles an admin may assign, in the order the role dropdown lists them.
 *
 * The `setRole` action accepts one more value — `''`, which clears the role back
 * to NULL — but that is server-side input only and deliberately not offered
 * here, so it stays in the action's own validation list.
 */
export const ASSIGNABLE_ROLES = ['user', 'contributor', 'admin'] as const;

/** Human-readable label for a user role. */
export function roleLabel(role: string | null | undefined): string {
	if (role === 'admin') return 'Admin';
	if (role === 'contributor') return 'Contributor';
	return 'User';
}

/** Badge colour for a role, so every badge showing one agrees on the styling. */
export function roleVariant(
	role: string | null | undefined
): 'default' | 'secondary' | 'destructive' | 'outline' {
	if (role === 'admin') return 'default';
	if (role === 'contributor') return 'secondary';
	return 'outline';
}
