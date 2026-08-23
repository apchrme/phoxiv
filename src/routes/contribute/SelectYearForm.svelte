<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import { resolve } from '$app/paths';
	import { enhance } from '$app/forms';
	import type { Pending } from '$lib/forms.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Combobox from '$lib/components/ui/combobox/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { ArrowRight, Pencil } from '@lucide/svelte';
	import { MAX_YEAR, MIN_YEAR } from '$lib/constants';

	/**
	 * Picks an existing olympiad and jumps to one of its years, creating the year
	 * record if it doesn't exist yet. A blank year edits the olympiad's own
	 * metadata instead — the server branches on that, not this component.
	 *
	 * The combobox and the "Edit olympiad metadata" button both read the selected
	 * id, which is why they belong in the same component. Splitting them would
	 * make `olympiadId` `$bindable` for no gain, and `Combobox.Root` has to stay a
	 * DOM descendant of the `<form>` regardless: it submits through a hidden input
	 * rendered in place, even though its dropdown portals to `document.body`.
	 */
	let {
		olympiads,
		form,
		pending
	}: {
		olympiads: PageData['olympiads'];
		form: ActionData;
		/** The page's single tracker, so the submit button can disable itself. */
		pending: Pending;
	} = $props();

	let olympiadId = $state<string | undefined>();
	let search = $state('');

	const filtered = $derived.by(() => {
		if (search === '') return olympiads;
		const q = search.toLowerCase();
		return olympiads.filter(
			(o) => o.name.toLowerCase().includes(q) || o.id.toLowerCase().includes(q)
		);
	});
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Go to a year</Card.Title>
		<Card.Description>
			Select an olympiad and enter a year. The year will be created if it doesn't exist yet. Leave
			the year blank to edit the olympiad's metadata instead.
		</Card.Description>
	</Card.Header>
	<Card.Content>
		<form
			method="POST"
			action="?/selectYear"
			use:enhance={pending.track('selectYear')}
			class="flex flex-col gap-4"
		>
			<div class="flex flex-col gap-1.5">
				<label for="olympiadId" class="text-sm font-medium">Olympiad</label>
				<Combobox.Root type="single" name="olympiadId" required bind:value={olympiadId}>
					<Combobox.Input
						oninput={(e) => (search = (e.currentTarget as HTMLInputElement).value)}
						placeholder="Search for an olympiad..."
					/>
					<Combobox.Content class="max-h-100 overflow-scroll">
						{#each filtered as o (o.id)}
							<Combobox.Item value={o.id} label={o.name}>{o.name}</Combobox.Item>
						{/each}
					</Combobox.Content>
				</Combobox.Root>
			</div>
			<div class="flex flex-col gap-1.5">
				<label for="year" class="text-sm font-medium">
					Year
					<span class="ml-1 text-xs font-normal text-muted-foreground">
						— leave blank to edit olympiad metadata
					</span>
				</label>
				<Input
					id="year"
					name="year"
					type="number"
					min={MIN_YEAR}
					max={MAX_YEAR}
					placeholder="e.g. 2025 (optional)"
				/>
			</div>
			{#if form && !form.success && form.action === 'selectYear'}
				<p class="text-sm text-destructive">{form.error}</p>
			{/if}
			<div class="flex flex-wrap gap-2">
				<Button type="submit" class="self-start" disabled={pending.has('selectYear')}>
					Go <ArrowRight />
				</Button>
				{#if olympiadId}
					<Button variant="outline" href={resolve(`/contribute/${olympiadId}`)}>
						<Pencil class="size-3.5" />
						Edit olympiad metadata
					</Button>
				{/if}
			</div>
		</form>
	</Card.Content>
</Card.Root>
