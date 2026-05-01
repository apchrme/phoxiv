<script lang="ts">
	import type { PageProps } from './$types';
	import { enhance } from '$app/forms';
	import Title from '$lib/components/Title.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { ArrowRight } from '@lucide/svelte';

	let initialTab = $state('existing');
	let { data, form }: PageProps = $props();
</script>

<Title title="Contribute" description="This is Houston. Right here, you can edit almost every piece of content on the olympiads page." />

<Tabs.Root class="mx-auto max-w-xl gap-5" bind:value={initialTab}>
	<Tabs.List variant="default">
		<Tabs.Trigger value="existing">Existing olympiad</Tabs.Trigger>
		<Tabs.Trigger value="new">New olympiad</Tabs.Trigger>
	</Tabs.List>

	<Tabs.Content value="existing">
		<Card.Root>
			<Card.Header>
				<Card.Title>Go to a year</Card.Title>
				<Card.Description>
					Select an olympiad and enter a year. The year will be created if it doesn't exist yet.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<form method="POST" action="?/selectYear" use:enhance class="flex flex-col gap-4">
					<div class="flex flex-col gap-1.5">
						<label for="olympiadId" class="text-sm font-medium">Olympiad</label>
						<select
							id="olympiadId"
							name="olympiadId"
							required
							class="h-9 w-full rounded-4xl border border-input bg-input/30 px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
						>
							{#each data.olympiads as o (o.id)}
								<option value={o.id}>{o.name}</option>
							{/each}
						</select>
					</div>
					<div class="flex flex-col gap-1.5">
						<label for="year" class="text-sm font-medium">Year</label>
						<input
							id="year"
							name="year"
							type="number"
							required
							min="1900"
							max="2100"
							placeholder="e.g. 2025"
							class="h-9 w-full rounded-4xl border border-input bg-input/30 px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
						/>
					</div>
					{#if form?.selectError}
						<p class="text-sm text-destructive">{form.selectError}</p>
					{/if}
					<Button type="submit" class="self-start">Go <ArrowRight /></Button>
				</form>
			</Card.Content>
		</Card.Root>
	</Tabs.Content>
	<Tabs.Content value="new">
		<Card.Root>
			<Card.Header>
				<Card.Title>New olympiad</Card.Title>
				<Card.Description>
					Creates a new olympiad and takes you straight to editing its first year.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<form method="POST" action="?/createOlympiad" use:enhance class="flex flex-col gap-4">
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div class="flex flex-col gap-1.5">
							<label for="id" class="text-sm font-medium"
								>ID <span class="text-sm text-muted-foreground">(unique acronym)</span></label
							>
							<Input
								id="id"
								name="id"
								type="text"
								required
								placeholder="e.g. ipho"
							/>
						</div>
						<div class="flex flex-col gap-1.5">
							<label for="icon" class="text-sm font-medium"
								>Icon <span class="text-sm text-muted-foreground">(optional, emoji)</span></label
							>
							<Input
								id="icon"
								name="icon"
								type="text"
								placeholder="e.g. 🌍"
							/>
						</div>
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
					<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
						<div class="flex flex-col gap-1.5">
							<label for="tag" class="text-sm font-medium">Tag</label>
							<select
								id="tag"
								name="tag"
								required
								class="h-9 w-full rounded-4xl border border-input bg-input/30 px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
							>
								<option value="International">International</option>
								<option value="Regional">Regional</option>
								<option value="National">National</option>
								<option value="Open">Open</option>
							</select>
						</div>
						<div class="flex flex-col gap-1.5">
							<label for="year" class="text-sm font-medium">First year</label>
							<Input
								id="year"
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
							rows="3"
							placeholder="Longer description shown on the olympiad page..."
						></Textarea>
					</div>
					{#if form?.createError}
						<p class="text-sm text-destructive">{form.createError}</p>
					{/if}
					<Button type="submit" class="self-start">Create olympiad <ArrowRight /></Button>
				</form>
			</Card.Content>
		</Card.Root>
	</Tabs.Content>
</Tabs.Root>
