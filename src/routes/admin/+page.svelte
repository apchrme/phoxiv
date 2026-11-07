<script lang="ts">
	import SvelteSeo from 'svelte-seo';
	import { resolve } from '$app/paths';
	import type { Component } from 'svelte';
	import UsersIcon from '@lucide/svelte/icons/users';
	import ScrollTextIcon from '@lucide/svelte/icons/scroll-text';
	import AwardIcon from '@lucide/svelte/icons/award';
	import TextSearchIcon from '@lucide/svelte/icons/text-search';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import PageHeader from '#lib/components/PageHeader.svelte';

	/**
	 * The admin menu. Each panel is its own page with its own load, so this page
	 * loads nothing and costs no D1 rows; the layout's `requireAdmin` guards it.
	 */
	type Panel = {
		href: string;
		title: string;
		description: string;
		icon: Component;
		/**
		 * SvelteKit's preload setting for the link. The app preloads on hover, but
		 * the search index's load reads thousands of D1 rows, so that link waits
		 * for a tap rather than paying for every pass of the pointer.
		 */
		preload?: 'tap';
	};

	const PANELS: Panel[] = [
		{
			href: resolve('admin/users'),
			title: 'Users',
			description: 'Roles, olympiad assignments and bans.',
			icon: UsersIcon
		},
		{
			href: resolve('admin/log'),
			title: 'Activity log',
			description: 'Every contributor and admin edit, newest first.',
			icon: ScrollTextIcon
		},
		{
			href: resolve('admin/badges'),
			title: 'Badges',
			description: 'Create and edit badges, and see who holds them.',
			icon: AwardIcon
		},
		{
			href: resolve('admin/search-index'),
			title: 'Search index',
			description: 'Full-text index counts, failures and maintenance.',
			icon: TextSearchIcon,
			preload: 'tap'
		}
	];
</script>

<SvelteSeo title="Admin — phoXiv" description="phoXiv admin panel" />

<PageHeader
	title="Admin"
	description="Manage user roles and access, badges, and the search index, and review the activity log."
/>

<nav aria-label="Admin panels">
	<ul class="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
		{#each PANELS as panel (panel.href)}
			<li>
				<!-- eslint-disable svelte/no-navigation-without-resolve -- `href` is resolved in `PANELS` -->
				<a
					href={panel.href}
					data-sveltekit-preload-data={panel.preload}
					class="group flex h-full items-center gap-4 rounded-2xl border border-border bg-card px-5 py-4 text-card-foreground ring-1 ring-foreground/5 transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
				>
					<panel.icon class="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
					<span class="flex min-w-0 flex-1 flex-col gap-0.5">
						<span class="font-medium">{panel.title}</span>
						<span class="text-sm text-muted-foreground">{panel.description}</span>
					</span>
					<ChevronRightIcon
						class="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
						aria-hidden="true"
					/>
				</a>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			</li>
		{/each}
	</ul>
</nav>
