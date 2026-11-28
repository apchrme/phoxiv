<script lang="ts">
	import { enhance } from '$app/forms';
	import SaveIcon from '@lucide/svelte/icons/save';
	import SendIcon from '@lucide/svelte/icons/send';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import Field from '#lib/components/forms/Field.svelte';
	import SubmitButton from '#lib/components/forms/SubmitButton.svelte';
	import { confirmBeforeLeaving, type Pending } from '#lib/forms.svelte.js';
	import { ANNOUNCEMENT_BODY_MAX, ANNOUNCEMENT_TITLE_MAX } from '#lib/announcements.js';
	import type { PageData } from './$types';

	/**
	 * The `?/save` form. Each field is a writable `$derived` of the loaded
	 * announcement, so a reload of the page data after a save resets the fields
	 * to what was stored, as in the badge editor.
	 */
	let { data, pending }: { data: PageData; pending: Pending } = $props();

	const announcement = $derived(data.announcement);

	/** The stored values, or blanks. Every field starts from it and `dirty` compares against it. */
	const initial = $derived({
		title: announcement?.title ?? '',
		body: announcement?.bodyMd ?? ''
	});

	let title = $derived(initial.title);
	let body = $derived(initial.body);

	const dirty = $derived(title !== initial.title || body !== initial.body);

	/**
	 * Nothing is saved until "Save", so warn before leaving with edits. The page
	 * calls `allowLeave` just before a new announcement moves to its own URL, and
	 * after a delete redirects; it keys this form by id, so the flag doesn't
	 * outlive the move.
	 */
	export const allowLeave = confirmBeforeLeaving(
		() => dirty,
		'You have unsaved changes to this announcement. Leave without saving?'
	);
</script>

<form method="POST" action="?/save" use:enhance={pending.track('save')} class="flex flex-col gap-5">
	<Card.Root>
		<Card.Header class="border-b">
			<Card.Title>Announcement</Card.Title>
			<Card.Description>
				The bell shows the title and the start of the body; the announcements page shows it all.
			</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-4">
			<Field label="Title" for="title">
				<Input
					id="title"
					name="title"
					required
					maxlength={ANNOUNCEMENT_TITLE_MAX}
					bind:value={title}
					placeholder="e.g. New papers are up"
				/>
			</Field>
			<Field label="Body" for="body" hint="(Markdown)">
				<Textarea
					id="body"
					name="body"
					required
					rows={8}
					maxlength={ANNOUNCEMENT_BODY_MAX}
					bind:value={body}
					placeholder="Links, **bold** and lists work."
				/>
			</Field>
		</Card.Content>
	</Card.Root>

	<div class="flex justify-end">
		<SubmitButton
			{pending}
			key="save"
			icon={announcement ? SaveIcon : SendIcon}
			busyLabel="Saving…"
		>
			{announcement ? 'Save changes' : 'Post announcement'}
		</SubmitButton>
	</div>
</form>
