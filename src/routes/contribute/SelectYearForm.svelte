<script lang="ts">
	import type { PageData } from './$types';
	import { resolve } from '$app/paths';
	import { enhance } from '$app/forms';
	import type { Pending } from '$lib/forms.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import OlympiadPicker from '$lib/components/OlympiadPicker.svelte';
	import Field from '$lib/components/forms/Field.svelte';
	import SubmitButton from '$lib/components/forms/SubmitButton.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { ArrowRight, Pencil } from '@lucide/svelte';
	import { MAX_YEAR, MIN_YEAR } from '$lib/constants';

	/**
	 * Picks an olympiad and goes to one of its years, creating the year if needed.
	 * A blank year goes to the olympiad's metadata instead (decided server-side).
	 * `OlympiadPicker` must stay inside the `<form>`: it submits via a hidden input.
	 */
	let {
		olympiads,
		pending
	}: {
		olympiads: PageData['olympiads'];
		/** The page's single `Pending`, so the submit button can disable itself. */
		pending: Pending;
	} = $props();

	let olympiadId = $state<string | null>(null);
</script>

<Card.Root>
	<Card.Header class="border-b">
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
			<!-- No `for`: the picker's trigger is a button. The server rejects an
			     empty choice, since a button can't be `required`. -->
			<Field label="Olympiad">
				<OlympiadPicker name="olympiadId" bind:value={olympiadId} {olympiads} />
			</Field>
			<Field label="Year" for="year" hint="— leave blank to edit olympiad metadata">
				<Input
					id="year"
					name="year"
					type="number"
					min={MIN_YEAR}
					max={MAX_YEAR}
					placeholder="e.g. 2025 (optional)"
				/>
			</Field>
			<div class="flex flex-wrap gap-2">
				<SubmitButton
					{pending}
					key="selectYear"
					icon={ArrowRight}
					iconSide="end"
					class="self-start"
				>
					Go
				</SubmitButton>
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
