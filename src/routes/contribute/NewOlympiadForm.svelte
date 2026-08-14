<script lang="ts">
	import type { ActionData } from './$types';
	import { enhance } from '$app/forms';
	import type { Pending } from '$lib/forms.svelte';
	import IconFilePicker from '$lib/components/forms/IconFilePicker.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { ArrowRight } from '@lucide/svelte';
	import { OLYMPIAD_TAGS, type OlympiadTag } from '$lib/types';
	import { ICON_UPLOAD } from '$lib/uploads';

	/**
	 * Creates an olympiad and its first year, then redirects into the year editor.
	 *
	 * Admin-only on the server; the tab is shown to every contributor, and the
	 * action refuses. Both icon fields are submitted — the server prefers the
	 * uploaded file and falls back to the emoji.
	 *
	 * `Select.Root` submits `tag` through a hidden input rendered in place while
	 * its list portals to `document.body`, so it has to stay inside the `<form>`.
	 */
	let {
		form,
		pending
	}: {
		form: ActionData;
		/** The page's single tracker, so the submit button can disable itself. */
		pending: Pending;
	} = $props();

	let tag = $state<OlympiadTag | undefined>();
</script>

<Card.Root>
	<Card.Header>
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
				<div class="flex flex-col gap-1.5">
					<label for="id" class="text-sm font-medium">
						ID <span class="text-sm text-muted-foreground">(unique acronym)</span>
					</label>
					<Input id="id" name="id" type="text" required placeholder="e.g. ipho" />
				</div>
				<div class="flex flex-col gap-1.5">
					<label for="icon" class="text-sm font-medium">
						Emoji icon <span class="text-sm text-muted-foreground">(optional)</span>
					</label>
					<Input id="icon" name="icon" type="text" placeholder="e.g. 🌍" />
				</div>
			</div>

			<!-- Icon file upload -->
			<div class="flex flex-col gap-1.5">
				<label for="iconFile" class="text-sm font-medium">
					Icon image
					<span class="text-sm text-muted-foreground">(optional — overrides emoji)</span>
				</label>
				<IconFilePicker class="flex-1" />
				<p class="text-xs text-muted-foreground">
					{ICON_UPLOAD.label} · max {ICON_UPLOAD.maxLabel}
				</p>
			</div>

			<div class="flex flex-col gap-1.5">
				<label for="name" class="text-sm font-medium">Full name</label>
				<Input
					id="name"
					name="name"
					type="text"
					required
					placeholder="e.g. International Physics Olympiad"
				/>
			</div>
			<div class="flex flex-col gap-1.5">
				<label for="summary" class="text-sm font-medium">Summary</label>
				<Input
					id="summary"
					name="summary"
					type="text"
					required
					placeholder="One sentence description"
				/>
			</div>
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<div class="flex flex-col gap-1.5">
					<!-- svelte-ignore a11y_label_has_associated_control -->
					<label class="text-sm font-medium">Tag</label>
					<Select.Root name="tag" type="single" bind:value={tag}>
						<Select.Trigger>
							{#if tag}
								{tag}
							{:else}
								<span class="text-sm text-muted-foreground">Select a tag...</span>
							{/if}
						</Select.Trigger>
						<Select.Content class="overflow-scroll">
							{#each OLYMPIAD_TAGS as olympiadTag (olympiadTag)}
								<Select.Item value={olympiadTag}>{olympiadTag}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
				<div class="flex flex-col gap-1.5">
					<label for="first-year" class="text-sm font-medium">First year</label>
					<Input
						id="first-year"
						name="year"
						type="number"
						required
						min="1900"
						max="2100"
						placeholder="e.g. 2025"
					/>
				</div>
			</div>
			<div class="flex flex-col gap-1.5">
				<label for="description" class="text-sm font-medium">
					Description <span class="text-sm text-muted-foreground">(optional, Markdown)</span>
				</label>
				<Textarea
					id="description"
					name="description"
					rows={3}
					placeholder="Longer description shown on the olympiad page..."
				></Textarea>
			</div>
			{#if form && !form.success && form.action === 'createOlympiad'}
				<p class="text-sm text-destructive">{form.error}</p>
			{/if}
			<Button type="submit" class="self-start" disabled={pending.has('createOlympiad')}>
				Create olympiad <ArrowRight />
			</Button>
		</form>
	</Card.Content>
</Card.Root>
