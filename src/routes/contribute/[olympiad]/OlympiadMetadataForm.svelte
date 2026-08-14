<script lang="ts">
	import type { PageData } from './$types';
	import { enhance } from '$app/forms';
	import type { Pending } from '$lib/forms.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import OlympiadIcon from '$lib/components/OlympiadIcon.svelte';
	import { Save } from '@lucide/svelte';
	import { OLYMPIAD_TAGS, type OlympiadTag } from '$lib/types';
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
			<div class="flex flex-col gap-1.5">
				<label for="name" class="text-sm font-medium">Full name</label>
				<Input
					id="name"
					name="name"
					type="text"
					required
					bind:value={name}
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
					bind:value={summary}
					placeholder="One-sentence description shown on the listing"
				/>
			</div>

			<div class="grid grid-cols-2 gap-4">
				<div class="flex flex-col gap-1.5">
					<label for="icon" class="text-sm font-medium">
						Emoji icon
						<span class="text-xs font-normal text-muted-foreground">
							{hasUploadedIcon ? '(overridden by upload)' : '(optional)'}
						</span>
					</label>
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
							<OlympiadIcon {icon} id={olympiad.id} class="h-7 w-auto shrink-0 text-3xl" />
						{/if}
					</div>
					{#if hasUploadedIcon}
						<p class="text-xs text-muted-foreground">
							Remove the uploaded icon above to use an emoji instead.
						</p>
					{/if}
				</div>

				<div class="flex flex-col gap-1.5">
					<!-- svelte-ignore a11y_label_has_associated_control -->
					<label class="text-sm font-medium">Tag</label>
					<Select.Root name="tag" type="single" bind:value={tag}>
						<Select.Trigger>
							{#if tag}
								{tag}
							{:else}
								<span class="text-sm text-muted-foreground">Select…</span>
							{/if}
						</Select.Trigger>
						<Select.Content>
							{#each OLYMPIAD_TAGS as olympiadTag (olympiadTag)}
								<Select.Item value={olympiadTag}>{olympiadTag}</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
			</div>

			<div class="flex flex-col gap-1.5">
				<label for="displayOrder" class="text-sm font-medium">
					Display order
					<span class="text-xs font-normal text-muted-foreground">(lower = earlier in listing)</span
					>
				</label>
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
			</div>
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

	<div class="flex items-center gap-3">
		<Button type="submit" class="disabled:bg-primary/60" disabled={pending.has('updateOlympiad')}>
			<Save class="size-4" />
			Save changes
		</Button>
		{#if pending.has('updateOlympiad')}
			<Spinner class="size-5" />
		{/if}
	</div>
</form>
