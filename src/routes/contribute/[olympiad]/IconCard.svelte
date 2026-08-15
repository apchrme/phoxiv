<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Pending } from '$lib/forms.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import OlympiadIcon from '$lib/components/OlympiadIcon.svelte';
	import IconFilePicker from '$lib/components/forms/IconFilePicker.svelte';
	import { Upload, X } from '@lucide/svelte';
	import { isIconUrl } from '$lib/uploads';

	/**
	 * Uploads and removes the olympiad's image icon.
	 *
	 * `icon` is read-only here. Both actions change it, but the page owns the
	 * variable — it is a `$derived` the page's toast handlers overwrite so the new
	 * icon appears before the load revalidates — so this card renders what it is
	 * given and lets the result come back down as a prop.
	 */
	let {
		olympiadId,
		icon,
		pending
	}: {
		olympiadId: string;
		/** The icon currently in force: an uploaded image URL, an emoji, or ''. */
		icon: string;
		/** The page's single tracker, so the submit buttons can disable themselves. */
		pending: Pending;
	} = $props();

	// The picker owns the object-URL lifecycle; this card only renders the larger
	// preview from the URL it hands back, and must not outlive it.
	let picker: ReturnType<typeof IconFilePicker> | undefined = $state();
	let previewUrl = $state<string | null>(null);

	/** Discards a pending selection. Called by the page once an upload lands. */
	export function clear() {
		picker?.clear();
	}

	/** Whether the current icon is an uploaded image rather than an emoji/flag. */
	const hasUploadedIcon = $derived(isIconUrl(icon));
</script>

<Card.Root>
	<Card.Header class="border-b">
		<Card.Title>Icon</Card.Title>
		<Card.Description>
			Upload a custom image (SVG, PNG, JPG, WebP, or AVIF, max 2 MB), or use an emoji / flag in the
			metadata form below. Uploaded images take priority over emoji icons.
		</Card.Description>
	</Card.Header>
	<Card.Content class="flex flex-col gap-4">
		<!-- Current icon preview -->
		<div class="flex items-center gap-4">
			<div
				class="flex size-16 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/30"
			>
				{#if previewUrl}
					<img src={previewUrl} alt="Icon preview" class="h-12 w-auto object-contain" />
				{:else}
					<OlympiadIcon {icon} id={olympiadId} class="h-10 w-auto text-4xl leading-none" />
				{/if}
			</div>
			<div class="flex flex-col gap-0.5 text-sm">
				{#if previewUrl}
					<span class="font-medium text-foreground">New icon selected</span>
					<span class="text-xs text-muted-foreground">Upload to apply</span>
				{:else if hasUploadedIcon}
					<span class="font-medium text-foreground">Custom uploaded icon</span>
					<span class="text-xs text-muted-foreground truncate max-w-48">{icon}</span>
				{:else if icon}
					<span class="font-medium text-foreground">Emoji / flag icon</span>
					<span class="text-xs text-muted-foreground">Upload an image to override it</span>
				{:else}
					<span class="text-muted-foreground">No icon set</span>
				{/if}
			</div>
		</div>

		<Separator />

		<!--
			Upload form.

			`invalidateAll: false` because re-running `load` hands
			`OlympiadMetadataForm` a freshly built `olympiad` object, which recomputes
			all five of its `$derived` fields and silently throws away whatever the
			contributor had typed into the metadata form but not yet saved.

			Nothing here needs that reload: the page's toast handler already overwrites
			`icon` from the action's `iconUrl`, and every consumer — the header, this
			card, the metadata form — reads that override rather than
			`data.olympiad.icon`.
		-->
		<form
			method="POST"
			action="?/uploadIcon"
			enctype="multipart/form-data"
			use:enhance={pending.track('uploadIcon', { invalidateAll: false })}
			class="flex flex-col gap-3"
		>
			<div class="flex flex-col gap-1.5">
				<label for="iconFile" class="text-sm font-medium">Image file</label>
				<IconFilePicker
					bind:this={picker}
					required
					showPreview={false}
					onchange={(_file, url) => (previewUrl = url)}
				/>
			</div>
			<div class="flex gap-2">
				<Button type="submit" size="sm" disabled={pending.has('uploadIcon') || !previewUrl}>
					{#if pending.has('uploadIcon')}
						<Spinner class="size-3.5" />
						Uploading…
					{:else}
						<Upload class="size-3.5" />
						Upload icon
					{/if}
				</Button>
				{#if previewUrl}
					<Button type="button" variant="ghost" size="sm" onclick={clear}>
						<X class="size-3.5" />
						Clear
					</Button>
				{/if}
			</div>
		</form>

		<!-- Remove uploaded icon -->
		{#if hasUploadedIcon}
			<Separator />
			<!-- `invalidateAll: false` for the same reason as the upload form above. -->
			<form
				method="POST"
				action="?/removeIcon"
				use:enhance={pending.track('removeIcon', { invalidateAll: false })}
			>
				<div class="flex items-center justify-between">
					<p class="text-xs text-muted-foreground">
						Remove the uploaded icon and fall back to the emoji/flag set in the metadata below.
					</p>
					<Button
						type="submit"
						variant="destructive"
						size="sm"
						disabled={pending.has('removeIcon')}
						class="ml-4 shrink-0"
					>
						{#if pending.has('removeIcon')}
							<Spinner class="size-3.5" />
						{:else}
							<X class="size-3.5" />
						{/if}
						Remove icon
					</Button>
				</div>
			</form>
		{/if}
	</Card.Content>
</Card.Root>
