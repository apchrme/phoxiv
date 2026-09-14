<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import Repeater from '$lib/components/forms/Repeater.svelte';
	import { newLinkRow, type LinkRow } from './metadata';

	/**
	 * The `linkLabel` / `linkUrl` repeater — fields only, no `<form>`.
	 *
	 * The two inputs are zipped by index on the server, so each row renders both,
	 * always, in this order.
	 */
	let { rows = $bindable() }: { rows: LinkRow[] } = $props();
</script>

<Card.Root>
	<Card.Header class="border-b">
		<Card.Title>Extra links</Card.Title>
		<Card.Description>External links not associated with uploaded files.</Card.Description>
	</Card.Header>
	<Card.Content class="flex flex-col gap-3">
		<Repeater bind:rows newRow={newLinkRow} itemLabel="link">
			{#snippet row(link)}
				<Input
					name="linkLabel"
					type="text"
					bind:value={link.label}
					placeholder="Label"
					class="w-20"
				/>
				<Input name="linkUrl" type="url" bind:value={link.url} placeholder="https://..." />
			{/snippet}
		</Repeater>
	</Card.Content>
</Card.Root>
