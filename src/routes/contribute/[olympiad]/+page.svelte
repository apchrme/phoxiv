<script lang="ts">
	import type { PageProps } from './$types';
	import { enhance } from '$app/forms';
	import { ChevronLeft, Save } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import OlympiadIcon from '$lib/components/OlympiadIcon.svelte';
	import { toast } from 'svelte-sonner';
	import { resolve } from '$app/paths';
	import SvelteSeo from 'svelte-seo';
	import type { OlympiadTag } from '$lib/types';

	let { data, form, params }: PageProps = $props();

	// Local state seeded from server data
	let name = $state(data.olympiad.name);
	let summary = $state(data.olympiad.summary);
	let icon = $state(data.olympiad.icon);
	let tag = $state<OlympiadTag>(data.olympiad.tag as OlympiadTag);
	let description = $state(data.olympiad.descriptionMd);
	let displayOrder = $state(String(data.olympiad.displayOrder ?? 9999));

	let saving = $state(false);

	$effect(() => {
		if (!form) return;
		if ('success' in form && form.success) {
			toast.success('Olympiad updated successfully');
		}
		if ('error' in form && form.error) {
			toast.error(String(form.error));
		}
	});
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
		<OlympiadIcon icon={data.olympiad.icon} id={data.olympiad.id} class="h-9 w-auto text-4xl leading-none" />
		<div>
			<h1 class="text-2xl font-bold tracking-tight">{data.olympiad.name}</h1>
			<p class="text-sm text-muted-foreground font-mono">{data.olympiad.id}</p>
		</div>
	</div>
	<p class="text-sm text-muted-foreground">
		Edit metadata for this olympiad. Changes will be reflected on the olympiad listing page.
	</p>
</header>

<div class="mx-auto max-w-xl">
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
							Icon <span class="text-xs text-muted-foreground">(emoji or blank)</span>
						</label>
						<div class="flex items-center gap-2">
							<Input
								id="icon"
								name="icon"
								type="text"
								bind:value={icon}
								placeholder="🌍"
								class="flex-1"
							/>
							{#if icon}
								<OlympiadIcon {icon} id={data.olympiad.id} class="h-7 w-auto shrink-0 text-3xl" />
							{/if}
						</div>
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
						Display order <span class="text-xs text-muted-foreground">(lower = earlier in listing)</span>
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
			{#if form && 'success' in form && form.success}
				<span class="text-sm text-muted-foreground">Saved!</span>
			{/if}
		</div>

		{#if form && 'error' in form && form.error}
			<p class="text-sm text-destructive">{form.error}</p>
		{/if}
	</form>

	<!-- Quick link to manage years -->
	<div class="mt-6 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
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