<script lang="ts">
	import type { PageData } from './$types';
	import { resolve } from '$app/paths';
	import { enhance } from '$app/forms';
	import type { Pending } from '$lib/forms.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import OlympiadPicker from '$lib/components/OlympiadPicker.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { ArrowRight, Pencil } from '@lucide/svelte';
	import { MAX_YEAR, MIN_YEAR } from '$lib/constants';

	/**
	 * Picks an existing olympiad and jumps to one of its years, creating the year
	 * record if it doesn't exist yet. A blank year edits the olympiad's own
	 * metadata instead — the server branches on that, not this component.
	 *
	 * The picker and the "Edit olympiad metadata" button both read the selected id,
	 * which is why they belong in the same component. Splitting them would make
	 * `olympiadId` `$bindable` for no gain, and `OlympiadPicker` has to stay a DOM
	 * descendant of the `<form>` regardless: it submits through a hidden input
	 * rendered in place, even though its panel portals to `document.body`.
	 *
	 * Errors are the page's to toast — see its `formToasts` call.
	 */
	let {
		olympiads,
		pending
	}: {
		olympiads: PageData['olympiads'];
		/** The page's single tracker, so the submit button can disable itself. */
		pending: Pending;
	} = $props();

	let olympiadId = $state<string | null>(null);
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
				<!-- A `<span>` and not a `<label for>`: the picker's trigger is a button, not
				     a form control, so nothing here is labellable. Its accessible name comes
				     from the `heading` prop instead. -->
				<span class="text-sm font-medium">Olympiad</span>
				<!-- No browser `required`, which a button cannot carry anyway: `selectYear`
				     already answers an empty submit with "Please select an olympiad", and the
				     page toasts it. -->
				<OlympiadPicker name="olympiadId" bind:value={olympiadId} {olympiads} />
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
