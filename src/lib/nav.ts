import { resolve } from '$app/paths';
import HouseIcon from '@lucide/svelte/icons/house';
import TrophyIcon from '@lucide/svelte/icons/trophy';
import LibraryIcon from '@lucide/svelte/icons/library';
import FileTextIcon from '@lucide/svelte/icons/file-text';
import { HandHelping, Shield, LockKeyhole } from '@lucide/svelte';
import type { Component } from 'svelte';

/**
 * A top-level site navigation entry.
 *
 * `href` is already passed through `resolve()`, so consumers must render it
 * as-is rather than resolving it again.
 */
export type NavLink = {
	href: string;
	label: string;
	/** Shown in the mobile sidebar only; the desktop nav is text-only. */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	icon: Component<any>;
};

/** Links shown directly in the desktop nav bar. */
export const PRIMARY_NAV: NavLink[] = [
	{ href: resolve('/'), label: 'home', icon: HouseIcon },
	{ href: resolve('/olympiads'), label: 'olympiads', icon: TrophyIcon },
	{ href: resolve('/resources'), label: 'resources', icon: LibraryIcon }
];

/** Links tucked behind the desktop nav's "more" dropdown. */
export const SECONDARY_NAV: NavLink[] = [
	{ href: resolve('/blog'), label: 'blog', icon: FileTextIcon },
	{ href: resolve('/contribute'), label: 'contribute', icon: HandHelping },
	{ href: resolve('/privacy'), label: 'privacy policy', icon: LockKeyhole }
];

const ADMIN_NAV: NavLink = { href: resolve('/admin'), label: 'admin', icon: Shield };

/**
 * The secondary links for `user`, with the admin panel appended for admins.
 *
 * Derived from the user on every call rather than pushed once at mount, so the
 * admin link appears and disappears across client-side sign-in and sign-out.
 */
export function secondaryNavFor(user: { role?: string | null } | null | undefined): NavLink[] {
	return user?.role === 'admin' ? [...SECONDARY_NAV, ADMIN_NAV] : SECONDARY_NAV;
}
