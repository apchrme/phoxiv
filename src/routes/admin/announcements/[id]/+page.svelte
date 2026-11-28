<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import SvelteSeo from 'svelte-seo';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import BackLink from '#lib/components/BackLink.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import ConfirmSubmit from '#lib/components/forms/ConfirmSubmit.svelte';
	import * as Card from '#lib/components/ui/card/index.js';
	import { formToasts, Pending } from '#lib/forms.svelte.js';
	import AnnouncementForm from './AnnouncementForm.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	/** The single `Pending` for the page, shared by the save and delete forms. */
	const pending = new Pending();

	let announcementForm: ReturnType<typeof AnnouncementForm> | undefined = $state();

	// The one `formToasts` call, on the component that owns `form`.
	formToasts(() => form, {
		save: (result) => {
			// A new announcement moves to its own URL, so a second save edits it
			// rather than posting another.
			if (result.created && typeof result.id === 'number') {
				announcementForm?.allowLeave();
				void goto(resolve(`admin/announcements/${result.id}`), { replaceState: true });
				return 'Announcement posted.';
			}
			return 'Announcement saved.';
		}
	});
</script>

<SvelteSeo
	title="{data.announcement ? `Edit ${data.announcement.title}` : 'New announcement'} — phoXiv"
/>

<BackLink href={resolve('admin/announcements')}>Announcements</BackLink>

<PageHeader
	title={data.announcement ? data.announcement.title : 'New announcement'}
	size="sm"
	description={data.announcement
		? 'Edits show straight away, without making it unread again for anyone who has seen it.'
		: "Posting puts it in everyone's notifications bell, unread."}
/>

<!-- Keyed by announcement: moving from `new` to the saved one's URL reuses this
     route, so without a remount the form would keep `allowLeave()`'s flag, and
     every later edit would leave without the unsaved-changes prompt. -->
{#key data.announcement?.id}
	<div class="mx-auto flex max-w-2xl flex-col gap-5 pb-16">
		<AnnouncementForm bind:this={announcementForm} {data} {pending} />

		{#if data.announcement}
			<form
				method="POST"
				action="?/delete"
				use:enhance={pending.track('delete', {
					// Only once it has gone: a refused delete stays on the page, and the
					// unsaved-changes prompt must keep working there.
					onDone: (result) => {
						if (result.type === 'redirect') announcementForm?.allowLeave();
					}
				})}
			>
				<Card.Root class="border-destructive/40">
					<Card.Header>
						<Card.Title>Delete announcement</Card.Title>
						<Card.Description>
							Removes it from the bell and the announcements page. This can't be undone.
						</Card.Description>
					</Card.Header>
					<Card.Content>
						<ConfirmSubmit
							{pending}
							key="delete"
							icon={Trash2Icon}
							title="Delete {data.announcement.title}?"
							description="It disappears for everyone. This can't be undone."
							confirmLabel="Delete announcement"
						>
							Delete announcement
						</ConfirmSubmit>
					</Card.Content>
				</Card.Root>
			</form>
		{/if}
	</div>
{/key}
