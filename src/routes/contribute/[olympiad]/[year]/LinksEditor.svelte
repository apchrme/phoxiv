<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Plus, Trash2 } from '@lucide/svelte';
	import { newLinkRow, type LinkRow } from './metadata';

	/**
	 * The `linkLabel` / `linkUrl` repeater — fields only, no `<form>`.
	 *
	 * The two inputs are zipped by index on the server, so each row renders both,
	 * always, in this order. `rows` is `$bindable` and has no fallback for the
	 * same reasons as in `NotesEditor`.
	 */
	let { rows = $bindable() }: { rows: LinkRow[] } = $props();
</script>

<Card.Root>
	<Card.Header class="border-b">
		<Card.Title>Extra links</Card.Title>
		<Card.Description>External links not associated with uploaded files.</Card.Description>
	</Card.Header>
	<Card.Content class="flex flex-col gap-3">
		{#each rows as link, i (link.id)}
			<div class="flex gap-2">
				<Input
					name="linkLabel"
					type="text"
					bind:value={link.label}
					placeholder="Label"
					class="w-20"
				/>
				<Input name="linkUrl" type="url" bind:value={link.url} placeholder="https://..." />
				<Button type="button" variant="ghost" size="icon-sm" onclick={() => rows.splice(i, 1)}>
					<Trash2 class="size-4" />
				</Button>
			</div>
		{/each}
		<Button
			type="button"
			variant="outline"
			size="sm"
			onclick={() => rows.push(newLinkRow())}
			class="self-start"
		>
			<Plus class="size-4" /> Add link
		</Button>
	</Card.Content>
</Card.Root>
