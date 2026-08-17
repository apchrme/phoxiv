<!--
	The olympiad `tag` select, shared by the create form and the metadata editor.

	`Select.Root` submits through a hidden input rendered *in place*, even though
	its list portals to `document.body` — so this component has to stay a DOM
	descendant of the `<form>` it belongs to. Don't hoist it out.

	The field name is fixed to `tag` rather than exposed as a prop: both actions
	read `tag`, and a mismatched name would fail silently as an empty field.
-->
<script lang="ts">
	import * as Select from '$lib/components/ui/select/index.js';
	import { OLYMPIAD_TAGS, type OlympiadTag } from '$lib/types.js';

	let {
		value = $bindable(),
		placeholder = 'Select a tag...'
	}: {
		/** The selected tag, or `undefined` while nothing is chosen. */
		value?: OlympiadTag;
		/** Trigger text shown while nothing is selected. */
		placeholder?: string;
	} = $props();
</script>

<Select.Root name="tag" type="single" bind:value>
	<Select.Trigger>
		{#if value}
			{value}
		{:else}
			<span class="text-sm text-muted-foreground">{placeholder}</span>
		{/if}
	</Select.Trigger>
	<Select.Content>
		{#each OLYMPIAD_TAGS as olympiadTag (olympiadTag)}
			<Select.Item value={olympiadTag}>{olympiadTag}</Select.Item>
		{/each}
	</Select.Content>
</Select.Root>
