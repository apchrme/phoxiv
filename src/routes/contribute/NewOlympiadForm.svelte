<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Pending } from '$lib/forms.svelte';
	import IconFilePicker from '$lib/components/forms/IconFilePicker.svelte';
	import Field from '$lib/components/forms/Field.svelte';
	import SubmitButton from '$lib/components/forms/SubmitButton.svelte';
	import TagSelect from '$lib/components/TagSelect.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { ArrowRight } from '@lucide/svelte';
	import { MAX_YEAR, MIN_YEAR } from '$lib/constants';
	import { type OlympiadTag } from '$lib/types';
	import { ICON_UPLOAD } from '$lib/uploads';

	/**
	 * Creates an olympiad and its first year, then redirects into the year editor.
	 *
	 * Admin-only on the server; the tab is shown to every contributor, and the
	 * action refuses. Both icon fields are submitted — the server prefers the
	 * uploaded file and falls back to the emoji.
	 *
	 * `TagSelect` submits `tag` through a hidden input rendered in place while its
	 * list portals to `document.body`, so it has to stay inside the `<form>`.
	 * Errors are the page's to toast — see its `formToasts` call.
	 */
	let {
		pending
	}: {
		/** The page's single tracker, so the submit button can disable itself. */
		pending: Pending;
	} = $props();

	let tag = $state<OlympiadTag | undefined>();
</script>

<Card.Root>
	<Card.Header class="border-b">
		<Card.Title>New olympiad</Card.Title>
		<Card.Description>
			Creates a new olympiad and takes you straight to editing its first year.
		</Card.Description>
	</Card.Header>
	<Card.Content>
		<form
			method="POST"
			action="?/createOlympiad"
			enctype="multipart/form-data"
			use:enhance={pending.track('createOlympiad')}
			class="flex flex-col gap-4"
		>
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<Field label="ID" for="id" hint="(unique acronym)">
					<Input id="id" name="id" type="text" required placeholder="e.g. ipho" />
				</Field>
				<Field label="Emoji icon" for="icon" hint="(optional)">
					<Input id="icon" name="icon" type="text" placeholder="e.g. 🌍" />
				</Field>
			</div>

			<Field label="Icon image" for="iconFile" hint="(optional — overrides emoji)">
				<IconFilePicker class="flex-1" />
				<p class="text-xs text-muted-foreground">
					{ICON_UPLOAD.label} · max {ICON_UPLOAD.maxLabel}
				</p>
			</Field>

			<Field label="Full name" for="name">
				<Input
					id="name"
					name="name"
					type="text"
					required
					placeholder="e.g. International Physics Olympiad"
				/>
			</Field>
			<Field label="Summary" for="summary">
				<Input
					id="summary"
					name="summary"
					type="text"
					required
					placeholder="One sentence description"
				/>
			</Field>
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<!-- No `for`: `TagSelect`'s trigger is a button, which `<label>` does not
				     apply to. `Field` renders a `<span>` instead, which is why this no
				     longer needs an `a11y_label_has_associated_control` suppression. -->
				<Field label="Tag">
					<TagSelect bind:value={tag} />
				</Field>
				<Field label="First year" for="first-year">
					<Input
						id="first-year"
						name="year"
						type="number"
						required
						min={MIN_YEAR}
						max={MAX_YEAR}
						placeholder="e.g. 2025"
					/>
				</Field>
			</div>
			<Field label="Description" for="description" hint="(optional, Markdown)">
				<Textarea
					id="description"
					name="description"
					rows={3}
					placeholder="Longer description shown on the olympiad page..."
				></Textarea>
			</Field>
			<SubmitButton
				{pending}
				key="createOlympiad"
				icon={ArrowRight}
				iconSide="end"
				busyLabel="Creating…"
				class="self-start"
			>
				Create olympiad
			</SubmitButton>
		</form>
	</Card.Content>
</Card.Root>
