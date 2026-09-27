<!--
	The olympiad `tag` select, for the create form and the metadata editor.
	Keep it inside its `<form>`: it submits via a hidden input rendered in place.
	The name is fixed to `tag` because both actions read that field.
-->
<script lang="ts">
	import * as Select from '$lib/components/ui/select/index.js';
	import { OLYMPIAD_TAGS, type OlympiadTag } from '$lib/types.js';

	let {
		value = $bindable(),
		placeholder = 'Select a tag...'
	}: {
		value?: OlympiadTag;
		/** Trigger text while nothing is selected. */
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
