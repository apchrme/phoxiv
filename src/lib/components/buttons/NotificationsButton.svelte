<script lang="ts">
	import BellIcon from '@lucide/svelte/icons/bell';
	import BellOffIcon from '@lucide/svelte/icons/bell-off';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import { afterNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import * as Popover from '#lib/components/ui/popover/index.js';
	import { buttonVariants } from '#lib/components/ui/button/index.js';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Skeleton } from '#lib/components/ui/skeleton/index.js';
	import EmptyState from '#lib/components/EmptyState.svelte';
	import { getNotifications } from '#lib/notifications.svelte.js';
	import { formatDate } from '#lib/utils/date.js';
	import { BELL_LIMIT } from '#lib/announcements.js';
	import { cn } from '#lib/utils.js';

	/**
	 * The navbar bell: the newest announcements, with a count of unseen ones.
	 * Opening it marks everything it shows as seen; what was unseen stays marked
	 * "New" while it is open. The seen set and the fetch live in the shared
	 * `Notifications` (#lib/notifications.svelte.ts), so the mobile and desktop
	 * bells agree.
	 */
	let { variant = 'outline' }: { variant?: 'outline' | 'ghost' } = $props();

	const notifications = getNotifications();

	let open = $state(false);
	/** Unseen when the panel last opened, so they stay marked after they're marked seen. */
	let fresh = $state<ReadonlySet<number>>(new Set());

	async function onOpenChange(next: boolean) {
		if (!next) return;
		// Normally already loaded by the layout; this also retries a failed fetch.
		await notifications.load();
		if (!open) return;
		const ids = notifications.announcements.map((a) => a.id);
		fresh = new Set(ids.filter((id) => !notifications.isRead(id)));
		notifications.markViewed(ids);
	}

	// A link in an announcement, or "View all", navigates client-side, which
	// keeps the layout (and this popover) mounted.
	afterNavigate(() => {
		open = false;
	});

	const unread = $derived(notifications.unreadCount);
</script>

<Popover.Root bind:open {onOpenChange}>
	<Popover.Trigger
		class={cn(buttonVariants({ variant, size: 'icon' }), 'relative')}
		title="Notifications"
	>
		<BellIcon />
		<!-- The accessible name is "Notifications" or "Notifications, 2 unread". -->
		<span class="sr-only">Notifications{unread > 0 ? `, ${unread} unread` : ''}</span>
		{#if unread > 0}
			<span
				aria-hidden="true"
				class="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[0.625rem] leading-none font-semibold text-primary-foreground"
			>
				{unread}
			</span>
		{/if}
	</Popover.Trigger>
	<Popover.Content align="end" class="w-80 max-w-[calc(100vw-2rem)] gap-0 p-0">
		<Popover.Header class="border-b px-4 py-3">
			<Popover.Title>Notifications</Popover.Title>
		</Popover.Header>

		{#if notifications.announcements.length > 0}
			<ul class="m-0 flex max-h-[min(28rem,70vh)] list-none flex-col overflow-y-auto p-0">
				{#each notifications.announcements as announcement (announcement.id)}
					<li
						class={cn(
							'flex flex-col gap-1 border-b px-4 py-3 last:border-b-0',
							fresh.has(announcement.id) && 'bg-primary/10'
						)}
					>
						<div class="flex items-start justify-between gap-2">
							<p class="m-0 font-medium">{announcement.title}</p>
							{#if fresh.has(announcement.id)}
								<Badge class="shrink-0">New</Badge>
							{/if}
						</div>
						<time
							class="text-xs text-muted-foreground"
							datetime={new Date(announcement.createdAt).toISOString()}
						>
							{formatDate(announcement.createdAt, 'short')}
						</time>
						<div class="prose prose-sm line-clamp-3 max-w-none text-sm">
							<!-- Sanitised server-side by #lib/server/markdown.ts before it is ever stored. -->
							<!-- eslint-disable-next-line svelte/no-at-html-tags -->
							{@html announcement.bodyHtml}
						</div>
					</li>
				{/each}
			</ul>
		{:else if notifications.failed}
			<EmptyState
				variant="error"
				icon={CircleAlertIcon}
				message="Couldn't load notifications"
				hint="Close this and try again."
				boxed={false}
				class="py-8"
			/>
		{:else if notifications.loading}
			<div
				class="flex flex-col gap-3 px-4 py-3"
				aria-busy="true"
				aria-label="Loading notifications"
			>
				{#each { length: Math.min(3, BELL_LIMIT) }, i (i)}
					<Skeleton class="h-14 w-full" />
				{/each}
			</div>
		{:else}
			<EmptyState icon={BellOffIcon} message="No announcements yet" boxed={false} class="py-8" />
		{/if}

		<a
			href={resolve('/announcements')}
			class="border-t px-4 py-3 text-center text-sm font-medium text-foreground transition-colors hover:text-primary motion-reduce:transition-none"
		>
			View all announcements
		</a>
	</Popover.Content>
</Popover.Root>
