<script lang="ts" generics="T extends { id: string }">
	import type { Snippet } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Plus, Trash2 } from '@lucide/svelte';

	/**
	 * A list of rows the contributor can add to and delete from.
	 *
	 * `rows` must be passed with `bind:`: this mutates it in place, and the prop
	 * has no fallback because a plain fallback array would swallow `push`.
	 *
	 * Never put a `<form>` here: callers sit inside `?/saveMetadata`'s form, and
	 * nested forms are invalid HTML. Rows must render every input
	 * unconditionally (see `metadata.ts`).
	 */
	let {
		rows = $bindable(),
		newRow,
		itemLabel,
		row,
		children
	}: {
		rows: T[];
		/** Builds a blank row, with the fresh `id` the `{#each}` is keyed by. */
		newRow: () => T;
		/** Lowercase singular noun for the button labels: "note", "link", "problem". */
		itemLabel: string;
		/** One row's fields, given the row and its index. */
		row: Snippet<[T, number]>;
		/** Rendered below the add button, e.g. validation summaries. */
		children?: Snippet;
	} = $props();
</script>

{#each rows as item, i (item.id)}
	<div class="flex flex-wrap items-center gap-2">
		{@render row(item, i)}
		<Button
			type="button"
			variant="ghost"
			size="icon-sm"
			aria-label="Remove {itemLabel}"
			onclick={() => rows.splice(i, 1)}
		>
			<Trash2 />
		</Button>
	</div>
{/each}
<Button
	type="button"
	variant="outline"
	size="sm"
	onclick={() => rows.push(newRow())}
	class="self-start"
>
	<Plus /> Add {itemLabel}
</Button>
{@render children?.()}
