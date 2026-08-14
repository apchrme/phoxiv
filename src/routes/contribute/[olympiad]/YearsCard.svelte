<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { Pending } from '$lib/forms.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { Plus, Pencil } from '@lucide/svelte';

	/**
	 * The olympiad's existing years, plus the form that adds one.
	 *
	 * `?/selectYear` always redirects into the year editor, so there is no success
	 * result to toast — only the failure line below. The action creates the year
	 * record when it doesn't exist yet, which is why the same control both adds
	 * and navigates.
	 */
	let {
		olympiadId,
		years,
		form,
		pending
	}: {
		olympiadId: string;
		years: PageData['years'];
		form: ActionData;
		/** The page's single tracker, so the submit button can disable itself. */
		pending: Pending;
	} = $props();
</script>

<Card.Root>
	<Card.Header class="border-b">
		<Card.Title>Years</Card.Title>
		<Card.Description>
			Select a year to edit its files and metadata, or add a new year below.
		</Card.Description>
	</Card.Header>
	<Card.Content class="flex flex-col gap-4">
		{#if years.length > 0}
			<div class="flex flex-wrap gap-2">
				{#each years as year (year)}
					<Button variant="outline" size="sm" href={resolve(`/contribute/${olympiadId}/${year}`)}>
						<Pencil class="size-3.5 text-muted-foreground" />
						{year}
					</Button>
				{/each}
			</div>
		{:else}
			<p class="text-sm text-muted-foreground">No years added yet.</p>
		{/if}

		<Separator />

		<!-- Add / jump to a year -->
		<form
			method="POST"
			action="?/selectYear"
			use:enhance={pending.track('selectYear', { reset: true })}
			class="flex flex-wrap items-end gap-2"
		>
			<div class="flex flex-col gap-1.5">
				<label for="newYear" class="text-xs font-medium text-muted-foreground">Year</label>
				<Input
					id="newYear"
					name="year"
					type="number"
					min="1900"
					max="2100"
					placeholder="e.g. 2025"
					required
					class="w-32"
				/>
			</div>
			<Button type="submit" size="sm" disabled={pending.has('selectYear')}>
				{#if pending.has('selectYear')}
					<Spinner class="size-3.5" />
				{:else}
					<Plus class="size-3.5" />
				{/if}
				Add / go to year
			</Button>
		</form>
		{#if form && !form.success && form.action === 'selectYear'}
			<p class="text-sm text-destructive">{form.error}</p>
		{/if}
	</Card.Content>
</Card.Root>
