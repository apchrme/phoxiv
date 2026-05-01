<script lang="ts">
	import type { PageProps } from './$types';
	import { enhance } from '$app/forms';
	import Title from '$lib/components/Title.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as ToggleGroup from '$lib/components/ui/toggle-group/index.js';

	let { data, form }: PageProps = $props();

	let mode = $state<'existing' | 'new'>('existing');
</script>

<Title title="Contribute" description="Add or edit olympiad content." />

<div class="mx-auto max-w-xl space-y-6">
	<ToggleGroup.Root
		type="single"
		value={mode}
		onValueChange={(v) => { if (v) mode = v as 'existing' | 'new'; }}
	>
		<ToggleGroup.Item value="existing">Existing olympiad</ToggleGroup.Item>
		<ToggleGroup.Item value="new">New olympiad</ToggleGroup.Item>
	</ToggleGroup.Root>

	{#if mode === 'existing'}
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
					<Button type="submit" class="self-start">Go →</Button>
				</form>
			</Card.Content>
		</Card.Root>
	{:else}
		<Card.Root>
			<Card.Header>
				<Card.Title>New olympiad</Card.Title>
				<Card.Description>
					Creates a new olympiad and takes you straight to editing its first year.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<form method="POST" action="?/createOlympiad" use:enhance class="flex flex-col gap-4">
					<div class="grid grid-cols-2 gap-4">
						<div class="flex flex-col gap-1.5">
							<label for="id" class="text-sm font-medium">ID <span class="text-muted-foreground">(slug)</span></label>
							<input
								id="id"
								name="id"
								type="text"
								required
								placeholder="e.g. ipho"
								class="h-9 w-full rounded-4xl border border-input bg-input/30 px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
							/>
						</div>
						<div class="flex flex-col gap-1.5">
							<label for="icon" class="text-sm font-medium">Icon <span class="text-muted-foreground">(emoji)</span></label>
							<input
								id="icon"
								name="icon"
								type="text"
								placeholder="e.g. 🌍"
								class="h-9 w-full rounded-4xl border border-input bg-input/30 px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
							/>
						</div>
					</div>
					<div class="flex flex-col gap-1.5">
						<label for="name" class="text-sm font-medium">Full name</label>
						<input
							id="name"
							name="name"
							type="text"
							required
							placeholder="e.g. International Physics Olympiad"
							class="h-9 w-full rounded-4xl border border-input bg-input/30 px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
						/>
					</div>
					<div class="flex flex-col gap-1.5">
						<label for="summary" class="text-sm font-medium">Summary</label>
						<input
							id="summary"
							name="summary"
							type="text"
							required
							placeholder="One sentence description"
							class="h-9 w-full rounded-4xl border border-input bg-input/30 px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
						/>
					</div>
					<div class="grid grid-cols-2 gap-4">
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
					</div>
					<div class="flex flex-col gap-1.5">
						<label for="description" class="text-sm font-medium">
							Description <span class="text-muted-foreground">(optional, Markdown)</span>
						</label>
						<textarea
							id="description"
							name="description"
							rows="3"
							placeholder="Longer description shown on the olympiad page..."
							class="w-full rounded-xl border border-input bg-input/30 px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
						></textarea>
					</div>
					{#if form?.createError}
						<p class="text-sm text-destructive">{form.createError}</p>
					{/if}
					<Button type="submit" class="self-start">Create olympiad →</Button>
				</form>
			</Card.Content>
		</Card.Root>
	{/if}
</div>