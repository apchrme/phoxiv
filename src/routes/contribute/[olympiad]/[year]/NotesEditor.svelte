<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import Repeater from '$lib/components/forms/Repeater.svelte';
	import { newNoteRow, type NoteRow } from './metadata';

	/**
	 * The `note` repeater — fields only, no `<form>`. See `Repeater` for why
	 * neither this nor its siblings may introduce one, and why `rows` is bound
	 * rather than passed.
	 */
	let { rows = $bindable() }: { rows: NoteRow[] } = $props();
</script>

<Card.Root>
	<Card.Header class="border-b">
		<Card.Title>Notes</Card.Title>
		<Card.Description>Short notices shown above the file links for this year.</Card.Description>
	</Card.Header>
	<Card.Content class="flex flex-col gap-3">
		<Repeater bind:rows newRow={newNoteRow} itemLabel="note">
			{#snippet row(note)}
				<Input
					name="note"
					type="text"
					bind:value={note.value}
					placeholder="e.g. Solutions are unofficial"
				/>
			{/snippet}
		</Repeater>
	</Card.Content>
</Card.Root>
