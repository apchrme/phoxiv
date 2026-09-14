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
	 * The `?/updateOlympiad` form: name, summary, emoji icon, tag, display order
	 * and the Markdown description.
	 *
	 * Every field is a `$derived` of the loaded row that the inputs then write
	 * back into — the Svelte 5 derived-override pattern. A save re-runs `load`,
	 * the derived re-reads the fresh row, and any draft the contributor was
	 * holding is replaced by what was actually persisted.
	 *
	 * `icon` is the exception: it belongs to the page, because the icon card and
	 * the page header read it too and the upload/remove toast handlers overwrite
	 * it optimistically. Re-deriving it here would silently discard that override.
	 */
	let {
		olympiad,
		icon = $bindable(),
		pending
	}: {
		olympiad: PageData['olympiad'];
		/** The icon in force, owned by the page. */
		icon: string;
		/** The page's single tracker, so the submit button can disable itself. */
		pending: Pending;
	} = $props();

	let name = $derived(olympiad.name);
	let summary = $derived(olympiad.summary);
	let tag = $derived<OlympiadTag>(olympiad.tag as OlympiadTag);
	let description = $derived(olympiad.descriptionMd);
	let displayOrder = $derived(String(olympiad.displayOrder ?? 9999));

	/**
	 * An uploaded image overrides the emoji, so the field is disabled rather than
	 * cleared. Browsers drop disabled controls from FormData, which is exactly why
	 * `updateOlympiad` treats an absent `icon` as "leave it alone" — submitting an
	 * empty string here used to wipe the uploaded icon's URL.
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

				<!-- No `for`: `TagSelect`'s trigger is a button, which `<label>` does not
				     apply to. -->
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

	<!-- The spinner used to sit *beside* this button rather than in it, one of the
	     three competing busy shapes `SubmitButton` settles. -->
	<SubmitButton {pending} key="updateOlympiad" icon={Save} busyLabel="Saving…" class="self-start">
		Save changes
	</SubmitButton>
</form>
