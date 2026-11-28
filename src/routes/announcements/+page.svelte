<script lang="ts">
	import { onMount } from 'svelte';
	import SvelteSeo from 'svelte-seo';
	import BellOffIcon from '@lucide/svelte/icons/bell-off';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import EmptyState from '#lib/components/EmptyState.svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { getNotifications } from '#lib/notifications.svelte.js';
	import { formatDate } from '#lib/utils/date.js';
	import { cn } from '#lib/utils.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const notifications = getNotifications();

	/**
	 * Unseen when the page opened. Visiting marks everything seen, as opening the
	 * bell does, and these stay marked "New" until the next visit.
	 */
	let fresh = $state<ReadonlySet<number>>(new Set());

	// Signed in, the seen set comes from this page's own load, which covers every
	// announcement; the shared one only knows the bell's. Signed out, it is the
	// browser's, read here because this runs before the layout's `onMount`.
	onMount(() => {
		const signedIn = data.read !== null;
		const read = new Set(data.read ?? []);
		notifications.hydrate();
		const unseen = data.announcements
			.map((a) => a.id)
			.filter((id) => (signedIn ? !read.has(id) : !notifications.isRead(id, false)));
		fresh = new Set(unseen);
		notifications.markViewed(unseen, signedIn);
	});
</script>

<SvelteSeo
	title="Announcements — phoXiv"
	description="News about phoXiv: new olympiads, site changes and events."
/>

<PageHeader title="Announcements" description="Updates and other news" />

{#if data.announcements.length === 0}
	<EmptyState icon={BellOffIcon} message="No announcements yet" />
{:else}
	<ol class="m-0 flex list-none flex-col gap-4 p-0">
		{#each data.announcements as announcement (announcement.id)}
			<li>
				<article
					aria-labelledby="announcement-{announcement.id}"
					class={cn(
						'flex flex-col gap-2 rounded-xl bg-card p-5 ring-1 ring-foreground/10',
						fresh.has(announcement.id) && 'ring-primary/50'
					)}
				>
					<header class="flex items-start justify-between gap-3">
						<div class="flex flex-col gap-1">
							<h2 id="announcement-{announcement.id}" class="m-0 text-xl font-semibold">
								{announcement.title}
							</h2>
							<time
								class="text-sm text-muted-foreground"
								datetime={new Date(announcement.createdAt).toISOString()}
							>
								{formatDate(announcement.createdAt)}
							</time>
						</div>
						{#if fresh.has(announcement.id)}
							<Badge class="shrink-0">New</Badge>
						{/if}
					</header>
					<div class="prose max-w-none">
						<!-- Sanitised server-side by #lib/server/markdown.ts before it is ever stored. -->
						<!-- eslint-disable-next-line svelte/no-at-html-tags -->
						{@html announcement.bodyHtml}
					</div>
				</article>
			</li>
		{/each}
	</ol>
{/if}
