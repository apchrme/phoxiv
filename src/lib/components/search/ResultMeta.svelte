<script lang="ts">
	import type { Snippet } from 'svelte';
	import OlympiadIcon from '$lib/components/OlympiadIcon.svelte';
	import { highlight } from '$lib/utils/fuzzy';

	/**
	 * The identity line of every ⌘K result row: olympiad icon, name and year.
	 *
	 * Problem rows pass `query` to mark matches. File rows must not, because
	 * their query matched the file's contents, not this text.
	 *
	 * `{@html}` is safe because `highlight` escapes what it wraps.
	 */
	let {
		olympiadId,
		olympiadIcon,
		olympiadName,
		year,
		query,
		children
	}: {
		olympiadId: string;
		olympiadIcon: string;
		olympiadName: string;
		year: number;
		/** When given, marks the characters it matched in the name and the year. */
		query?: string;
		/** Appended after the year — the problems a file covers. */
		children?: Snippet;
	} = $props();
</script>

<div class="flex items-center gap-1.5 text-muted-foreground">
	<OlympiadIcon icon={olympiadIcon} id={olympiadId} size="sm" />
	{#if query === undefined}
		<span>{olympiadName}</span>
		<span aria-hidden="true">·</span>
		<span class="font-mono">{year}</span>
	{:else}
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		<span>{@html highlight(olympiadName, query)}</span>
		<span aria-hidden="true">·</span>
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		<span class="font-mono">{@html highlight(String(year), query)}</span>
	{/if}
	{@render children?.()}
</div>
