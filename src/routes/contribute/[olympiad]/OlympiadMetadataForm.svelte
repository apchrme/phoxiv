<script lang="ts">
	import type { PageData } from './$types';
	import { enhance } from '$app/forms';
	import type { Pending } from '$lib/forms.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import Field from '$lib/components/forms/Field.svelte';
	import SubmitButton from '$lib/components/forms/SubmitButton.svelte';
	import OlympiadIcon from '$lib/components/OlympiadIcon.svelte';
	import TagSelect from '$lib/components/TagSelect.svelte';
	import { Save } from '@lucide/svelte';
	import { type OlympiadTag } from '$lib/types';
	import { isIconUrl } from '$lib/uploads';

	/**
	 * The `?/updateOlympiad` form. Each field is a writable `$derived` of the
	 * loaded row, so any reload of the page data resets it to the saved values.
	 * That's why the icon forms use `invalidateAll: false`.
	 *
	 * `icon` is owned by the page, which updates it after icon uploads. Don't
	 * derive it here, or that update is lost.
	 */
	let {
		olympiad,
		icon = $bindable(),
		pending
	}: {
		olympiad: PageData['olympiad'];
		/** Owned by the page. */
		icon: string;
		/** The page's single `Pending`, so the submit button can disable itself. */
		pending: Pending;
	} = $props();

	let name = $derived(olympiad.name);
	let summary = $derived(olympiad.summary);
	let tag = $derived<OlympiadTag>(olympiad.tag as OlympiadTag);
	let description = $derived(olympiad.descriptionMd);
	let displayOrder = $derived(String(olympiad.displayOrder ?? 9999));

	/**
	 * With an uploaded icon the emoji field is disabled, so it isn't submitted and
	 * `updateOlympiad` leaves the icon alone. Don't submit `''` instead: that
	 * wiped uploaded icons.
	 */
	const hasUploadedIcon = $derived(isIconUrl(icon));
</script>

<form
	method="POST"
	action="?/updateOlympiad"
	use:enhance={pending.track('updateOlympiad')}
	class="flex flex-col gap-5"
>
	<Card.Root>
		<Card.Header class="border-b">
			<Card.Title>Basic information</Card.Title>
			<Card.Description>Core details shown on the olympiad listing and page.</Card.Description>
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
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header class="border-b">
			<Card.Title>Description</Card.Title>
			<Card.Description>
				Optional extended description shown on the olympiad's page. Supports Markdown.
			</Card.Description>
		</Card.Header>
		<Card.Content>
			<Textarea
				id="description"
				name="description"
				rows={6}
				bind:value={description}
				placeholder="Write a longer description using Markdown…"
			/>
		</Card.Content>
	</Card.Root>

	<SubmitButton {pending} key="updateOlympiad" icon={Save} busyLabel="Saving…" class="self-start">
		Save changes
	</SubmitButton>
</form>
