<script lang="ts">
	import type { PageProps } from './$types';
	import { enhance } from '$app/forms';
	import { ChevronLeft, Save, Upload, X, Image } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import OlympiadIcon from '$lib/components/OlympiadIcon.svelte';
	import { toast } from 'svelte-sonner';
	import { resolve } from '$app/paths';
	import SvelteSeo from 'svelte-seo';
	import type { OlympiadTag } from '$lib/types';

	let { data, form }: PageProps = $props();

	// Local state seeded from server data — refreshed when form returns a new iconUrl
	let name = $derived(data.olympiad.name);
	let summary = $derived(data.olympiad.summary);
	let icon = $derived(data.olympiad.icon);
	let tag = $derived<OlympiadTag>(data.olympiad.tag as OlympiadTag);
	let description = $derived(data.olympiad.descriptionMd);
	let displayOrder = $derived(String(data.olympiad.displayOrder ?? 9999));

	let saving = $state(false);
	let uploadingIcon = $state(false);
	let removingIcon = $state(false);

	// Preview for the selected-but-not-yet-uploaded icon file
	let iconPreviewUrl = $state<string | null>(null);
	let iconFileInput: HTMLInputElement | undefined = $state();

	function onIconFileChange(e: Event) {
		const file = (e.currentTarget as HTMLInputElement).files?.[0];
		if (!file) {
			iconPreviewUrl = null;
			return;
		}
		iconPreviewUrl = URL.createObjectURL(file);
	}

	function clearIconFile() {
		if (iconPreviewUrl) URL.revokeObjectURL(iconPreviewUrl);
		iconPreviewUrl = null;
		if (iconFileInput) iconFileInput.value = '';
	}

	$effect(() => {
		if (!form) return;
		if ('action' in form) {
			if (form.action === 'updateOlympiad' && 'success' in form && form.success) {
				toast.success('Olympiad updated');
			}
			if (form.action === 'uploadIcon' && 'success' in form && form.success) {
				toast.success('Icon uploaded');
				// Update local icon so OlympiadIcon re-renders immediately
				if ('iconUrl' in form && typeof form.iconUrl === 'string') {
					icon = form.iconUrl;
				}
				clearIconFile();
			}
			if (form.action === 'removeIcon' && 'success' in form && form.success) {
				toast.success('Icon removed');
				icon = '';
				clearIconFile();
			}
		}
		if ('updateError' in form && form.updateError) toast.error(String(form.updateError));
		if ('uploadIconError' in form && form.uploadIconError) toast.error(String(form.uploadIconError));
	});

	// Whether the current icon is an uploaded image (URL)
	const hasUploadedIcon = $derived(icon.startsWith('https://') || icon.startsWith('http://'));
</script>

<SvelteSeo
	title="Edit {data.olympiad.name} — phoXiv"
	description="Edit olympiad metadata for {data.olympiad.name}"
/>

<a
	href={resolve('/contribute')}
	class="mt-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground no-underline transition-colors hover:text-primary"
>
	<ChevronLeft class="size-4" />
	Back to contribute
</a>

<header class="flex flex-col gap-2 py-5">
	<div class="flex items-center gap-3">
		<OlympiadIcon {icon} id={data.olympiad.id} class="h-9 w-auto text-4xl leading-none" />
		<div>
			<h1 class="text-2xl font-bold tracking-tight">{name}</h1>
			<p class="text-sm text-muted-foreground font-mono">{data.olympiad.id}</p>
		</div>
	</div>
	<p class="text-sm text-muted-foreground">
		Edit metadata for this olympiad. Changes will be reflected on the olympiad listing page.
	</p>
</header>

<div class="mx-auto max-w-xl flex flex-col gap-5">

	<!-- ── Icon card ─────────────────────────────────────────────────── -->
	<Card.Root>
		<Card.Header class="border-b">
			<Card.Title>Icon</Card.Title>
			<Card.Description>
				Upload a custom image (SVG, PNG, JPG, WebP, or AVIF, max 2 MB), or use an emoji / flag in the metadata form below.
				Uploaded images take priority over emoji icons.
			</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-4">

			<!-- Current icon preview -->
			<div class="flex items-center gap-4">
				<div class="flex size-16 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/30">
					{#if iconPreviewUrl}
						<img src={iconPreviewUrl} alt="Icon preview" class="h-12 w-auto object-contain" />
					{:else}
						<OlympiadIcon {icon} id={data.olympiad.id} class="h-10 w-auto text-4xl leading-none" />
					{/if}
				</div>
				<div class="flex flex-col gap-0.5 text-sm">
					{#if iconPreviewUrl}
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

			<!-- Upload form -->
			<form
				method="POST"
				action="?/uploadIcon"
				enctype="multipart/form-data"
				use:enhance={() => {
					uploadingIcon = true;
					return async ({ update }) => {
						uploadingIcon = false;
						await update({ reset: false });
					};
				}}
				class="flex flex-col gap-3"
			>
				<div class="flex flex-col gap-1.5">
					<label for="iconFile" class="text-sm font-medium">Image file</label>
					<input
						bind:this={iconFileInput}
						id="iconFile"
						name="iconFile"
						type="file"
						accept=".svg,.png,.jpg,.jpeg,.webp,.avif,image/svg+xml,image/png,image/jpeg,image/webp,image/avif"
						required
						onchange={onIconFileChange}
						class="text-sm text-muted-foreground file:mr-3 file:rounded-4xl file:border file:border-border file:bg-card file:px-3 file:py-1 file:text-sm file:font-medium file:text-foreground cursor-pointer"
					/>
				</div>
				<div class="flex gap-2">
					<Button type="submit" size="sm" disabled={uploadingIcon || !iconPreviewUrl}>
						{#if uploadingIcon}
							<Spinner class="size-3.5" />
							Uploading…
						{:else}
							<Upload class="size-3.5" />
							Upload icon
						{/if}
					</Button>
					{#if iconPreviewUrl}
						<Button type="button" variant="ghost" size="sm" onclick={clearIconFile}>
							<X class="size-3.5" />
							Clear
						</Button>
					{/if}
				</div>
			</form>

			<!-- Remove uploaded icon -->
			{#if hasUploadedIcon}
				<Separator />
				<form
					method="POST"
					action="?/removeIcon"
					use:enhance={() => {
						removingIcon = true;
						return async ({ update }) => {
							removingIcon = false;
							await update({ reset: false });
						};
					}}
				>
					<div class="flex items-center justify-between">
						<p class="text-xs text-muted-foreground">
							Remove the uploaded icon and fall back to the emoji/flag set in the metadata below.
						</p>
						<Button type="submit" variant="destructive" size="sm" disabled={removingIcon} class="ml-4 shrink-0">
							{#if removingIcon}
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

	<!-- ── Metadata form ──────────────────────────────────────────────── -->
	<form
		method="POST"
		action="?/updateOlympiad"
		use:enhance={() => {
			saving = true;
			return async ({ update }) => {
				saving = false;
				await update({ reset: false });
			};
		}}
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
								<OlympiadIcon {icon} id={data.olympiad.id} class="h-7 w-auto shrink-0 text-3xl" />
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
								<Select.Item value="International">International</Select.Item>
								<Select.Item value="Regional">Regional</Select.Item>
								<Select.Item value="National">National</Select.Item>
								<Select.Item value="Open">Open</Select.Item>
							</Select.Content>
						</Select.Root>
					</div>
				</div>

				<div class="flex flex-col gap-1.5">
					<label for="displayOrder" class="text-sm font-medium">
						Display order
						<span class="text-xs font-normal text-muted-foreground">(lower = earlier in listing)</span>
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
			<Button type="submit" class="disabled:bg-primary/60" disabled={saving}>
				<Save class="size-4" />
				Save changes
			</Button>
			{#if saving}
				<Spinner class="size-5" />
			{/if}
		</div>
	</form>

	<!-- Quick link to manage years -->
	<div class="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
		<p class="mb-2 font-medium text-foreground">Manage years for this olympiad</p>
		<p class="mb-3 text-xs">
			To add or edit content for a specific year, go back to the contribute page and select this olympiad with a year.
		</p>
		<a
			href={resolve('/contribute')}
			class="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
		>
			Go to contribute →
		</a>
	</div>

</div>