<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Plus, Trash2 } from '@lucide/svelte';
	import { newNoteRow, type NoteRow } from './metadata';

	/**
	 * The `note` repeater — fields only, no `<form>`.
	 *
	 * These inputs belong to the parent's `?/saveMetadata` form. HTML forbids
	 * nested forms, so a `<form>` here would be discarded by the parser and the
	 * fields would end up submitting somewhere unexpected.
	 *
	 * `rows` is the parent's deep-`$state` array. It is `$bindable` because this
	 * component mutates it in place — `push`, `splice` and the row-level
	 * `bind:value` all write to state the parent owns, which Svelte only permits
	 * across a `bind:`. It deliberately has no fallback value: a fallback is a
	 * plain array rather than a proxy, so `push` would silently go nowhere.
	 */
	let { rows = $bindable() }: { rows: NoteRow[] } = $props();
</script>

<Card.Root>
	<Card.Header class="border-b">
		<Card.Title>Notes</Card.Title>
		<Card.Description>Short notices shown above the file links for this year.</Card.Description>
	</Card.Header>
	<Card.Content class="flex flex-col gap-3">
		{#each rows as note, i (note.id)}
			<div class="flex gap-2">
				<Input
					name="note"
					type="text"
					bind:value={note.value}
					placeholder="e.g. Solutions are unofficial"
				/>
				<Button type="button" variant="ghost" size="icon-sm" onclick={() => rows.splice(i, 1)}>
					<Trash2 class="size-4" />
				</Button>
			</div>
		{/each}
		<Button
			type="button"
			variant="outline"
			size="sm"
			onclick={() => rows.push(newNoteRow())}
			class="self-start"
		>
			<Plus class="size-4" /> Add note
		</Button>
	</Card.Content>
</Card.Root>
