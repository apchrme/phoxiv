<script lang="ts">
	import type { PageData } from './$types';
	import { enhance } from '$app/forms';
	import { confirmBeforeLeaving, type Pending } from '#lib/forms.svelte.js';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import Field from '#lib/components/forms/Field.svelte';
	import SubmitButton from '#lib/components/forms/SubmitButton.svelte';
	import OlympiadIcon from '#lib/components/OlympiadIcon.svelte';
	import TagSelect from '#lib/components/TagSelect.svelte';
	import { Save } from '@lucide/svelte';
	import { type OlympiadTag } from '#lib/types.js';
	import { isIconUrl } from '#lib/uploads.js';

	/**
	 * The `?/updateOlympiad` form. Each field is a writable `$derived` of the
	 * loaded row, so any reload of the page data resets it to the saved values.
	 * That's why the icon forms use `refreshAll: false`.
	 *
	 * `icon` is owned by the page, which updates it after icon uploads. Don't
	 * derive it here, or that update is lost.
	 */
	let {
		olympiad,
		icon = $bindable(),
		savedIcon,
		pending
	}: {
		olympiad: PageData['olympiad'];
		/** Owned by the page. */
		icon: string;
		/** The icon as stored, which `olympiad.icon` isn't after an icon upload or removal. */
		savedIcon: string;
		/** The page's single `Pending`, so the submit button can disable itself. */
		pending: Pending;
	} = $props();

	let name = $derived(olympiad.name);
	let summary = $derived(olympiad.summary);
	let tag = $derived<OlympiadTag>(olympiad.tag as OlympiadTag);
	let description = $derived(olympiad.descriptionMd);
	const savedDisplayOrder = $derived(String(olympiad.displayOrder ?? 9999));
	let displayOrder = $derived(savedDisplayOrder);

	/**
	 * With an uploaded icon the emoji field is disabled, so it isn't submitted and
	 * `updateOlympiad` leaves the icon alone. Don't submit `''` instead: that
	 * wiped uploaded icons.
	 */
	const hasUploadedIcon = $derived(isIconUrl(icon));

	/**
	 * Whether any field differs from what's stored. A save reloads the page data,
	 * which resets every field and so clears this. `String()` because a number
	 * input's binding writes a number back.
	 */
	const dirty = $derived(
		name !== olympiad.name ||
			summary !== olympiad.summary ||
			tag !== olympiad.tag ||
			description !== olympiad.descriptionMd ||
			String(displayOrder) !== savedDisplayOrder ||
			(!hasUploadedIcon && icon !== savedIcon)
	);

	// Nothing here is saved until "Save changes", so warn before leaving with edits.
	// `confirmBeforeLeaving` explains why a reload gets only the browser's prompt.
	confirmBeforeLeaving(
		() => dirty,
		'You have unsaved changes to this olympiad. Leave without saving?'
	);
</script>

<form method="POST" action="?/updateOlympiad" use:enhance={pending.track('updateOlympiad')}>
	<Card.Root>
		<Card.Header class="border-b">
			<Card.Title>Basic information</Card.Title>
			<Card.Description>
				Shown on the olympiad listing and the olympiad's page. Edits here apply only once you save
				them.
			</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-4">
			<Field label="Full name" for="name">
				<Input
					id="name"
					name="name"
					type="text"
					required
					bind:value={name}
					placeholder="e.g. International Physics Olympiad"
				/>
			</Field>

			<Field label="Summary" for="summary">
				<Input
					id="summary"
					name="summary"
					type="text"
					required
					bind:value={summary}
					placeholder="One-sentence description shown on the listing"
				/>
			</Field>

			<div class="grid grid-cols-2 gap-4">
				<Field
					label="Emoji icon"
					for="icon"
					hint={hasUploadedIcon ? '(overridden by upload)' : '(optional)'}
				>
					<div class="flex items-center gap-2">
						<Input
							id="icon"
							name="icon"
							type="text"
							bind:value={icon}
							placeholder="e.g. 🌍"
							class="flex-1"
							disabled={hasUploadedIcon}
						/>
						{#if icon && !hasUploadedIcon}
							<OlympiadIcon {icon} id={olympiad.id} size="md" />
						{/if}
					</div>
					{#if hasUploadedIcon}
						<p class="text-xs text-muted-foreground">
							Remove the uploaded icon above to use an emoji instead.
						</p>
					{/if}
				</Field>

				<!-- No `for`: `TagSelect`'s trigger is a button. -->
				<Field label="Tag">
					<TagSelect bind:value={tag} placeholder="Select…" />
				</Field>
			</div>

			<Field label="Display order" for="displayOrder" hint="(lower = earlier in listing)">
				<Input
					id="displayOrder"
					name="displayOrder"
					type="number"
					min="0"
					max="9999"
					bind:value={displayOrder}
					placeholder="9999"
					class="w-32"
				/>
			</Field>

			<Field label="Description" for="description" hint="(optional, Markdown)">
				<Textarea
					id="description"
					name="description"
					rows={6}
					bind:value={description}
					placeholder="Write a longer description using Markdown…"
				/>
			</Field>

			<SubmitButton {pending} key="updateOlympiad" icon={Save} busyLabel="Saving…">
				Save changes
			</SubmitButton>
			{#if dirty}
				<span class="text-xs text-muted-foreground">Unsaved changes</span>
			{/if}
		</Card.Content>
	</Card.Root>
</form>
