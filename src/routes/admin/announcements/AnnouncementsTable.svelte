<script lang="ts">
	import { resolve } from '$app/paths';
	import MegaphoneIcon from '@lucide/svelte/icons/megaphone';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import { Button } from '#lib/components/ui/button/index.js';
	import EmptyState from '#lib/components/EmptyState.svelte';
	import { formatDate } from '#lib/utils/date.js';
	import { BELL_LIMIT } from '#lib/announcements.js';
	import type { PageData } from './$types';

	/**
	 * Every announcement, newest first, with its date and author. Editing and
	 * deleting happen on `/admin/announcements/[id]`, so this list has no forms.
	 */
	let { announcements }: { announcements: PageData['announcements'] } = $props();
</script>

<div class="flex flex-col gap-3">
	<div class="flex items-center justify-between gap-2">
		<p class="m-0 text-sm text-muted-foreground">
			The bell shows the newest {BELL_LIMIT}; all of them are on the public announcements page.
		</p>
		<Button size="sm" href={resolve('admin/announcements/new')}>
			<PlusIcon />
			New announcement
		</Button>
	</div>

	{#if announcements.length === 0}
		<EmptyState
			icon={MegaphoneIcon}
			message="No announcements yet"
			hint="Create one, and it appears in everyone's notifications."
		/>
	{:else}
		<ul aria-label="Announcements" class="m-0 flex list-none flex-col gap-2 p-0">
			{#each announcements as announcement (announcement.id)}
				<li
					class="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-card-foreground"
				>
					<div class="flex min-w-0 flex-1 flex-col">
						<span class="truncate font-medium">{announcement.title}</span>
						<span class="truncate text-xs text-muted-foreground">
							{formatDate(announcement.createdAt, 'short')} · {announcement.authorName ??
								'Deleted user'}
						</span>
					</div>
					<Button
						variant="outline"
						size="sm"
						href={resolve(`admin/announcements/${announcement.id}`)}
						aria-label="Edit {announcement.title}"
					>
						<PencilIcon />
						Edit
					</Button>
				</li>
			{/each}
		</ul>
	{/if}
</div>
