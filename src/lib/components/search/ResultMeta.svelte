<script lang="ts">
	import type { Snippet } from 'svelte';
	import OlympiadIcon from '$lib/components/OlympiadIcon.svelte';
	import { highlight } from '$lib/utils/fuzzy';

	/**
	 * The identity line every ⌘K result row opens with: the olympiad's icon, its
	 * name, and the year, separated by middots.
	 *
	 * Shared by both result kinds because it says the same thing in both — *which
	 * contest, which year* — and the two copies had already begun to drift apart at
	 * the icon.
	 *
	 * # `query` is optional, and that is the one real difference between them
	 *
	 * A problem row marks the characters the query matched, because the query ran
	 * over exactly this text. A file row does **not**, and must not: there the
	 * query matched the file's *contents*, so marking the olympiad's name would
	 * claim a match that never happened. Passing no `query` is how a caller says
	 * so, rather than passing one and hoping nothing marks.
	 *
	 * `{@html}` is safe here for the reason `highlight` documents: it escapes the
	 * text it wraps. It is never given a snippet from a PDF — those travel as
	 * offsets, and the row renders them as text.
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
