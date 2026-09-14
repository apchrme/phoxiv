<script lang="ts" generics="T extends { id: string }">
	import type { Snippet } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Plus, Trash2 } from '@lucide/svelte';

	/**
	 * A list of rows the contributor can add to and delete from.
	 *
	 * Three editors on the year page — notes, extra links, problems — had the same
	 * skeleton written out three times: keyed `{#each}`, a flex row, a ghost
	 * delete button, an outline "Add …" button below. Only the fields inside a row
	 * differed, which is exactly the thing a snippet is for.
	 *
	 * It settles two disagreements those three had drifted into. The delete button
	 * is `icon-sm`, which is what notes and links used and what problems — sitting
	 * on the same tab — did not. And it now carries an accessible name: all three
	 * were a bare trash icon, which a screen reader reads as nothing at all.
	 *
	 * # `rows` is bound, and must be
	 *
	 * This mutates the caller's array in place — `push` and `splice` — and the
	 * caller's rows are deep `$state` whose fields the row snippet `bind:`s to.
	 * Svelte only permits writing to state another component owns across a
	 * `bind:`, and the prop deliberately has no fallback: a fallback is a plain
	 * array rather than a proxy, so `push` would silently go nowhere.
	 *
	 * # No `<form>` here, ever
	 *
	 * Every caller's fields belong to the year page's `?/saveMetadata` form, and
	 * HTML forbids nested forms — a `<form>` here would be dropped by the parser
	 * and the fields would submit somewhere unexpected. `saveMetadata` zips the
	 * repeaters by position, which is why a row renders all of its inputs
	 * unconditionally: an input behind an `{#if}` shifts every later row's data
	 * into the wrong record.
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
		/** The singular noun, lowercase: "note", "link", "problem". Spells both buttons. */
		itemLabel: string;
		/** One row's fields, given the row and its index. */
		row: Snippet<[T, number]>;
		/** Rendered below the add button — validation summaries, mostly. */
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
