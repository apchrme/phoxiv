<script lang="ts">
	import type { FileSearchResult } from '$lib/types.js';
	import { splitMarks } from '$lib/utils/fuzzy';
	import ResultMeta from './ResultMeta.svelte';
	import { FileText } from '@lucide/svelte';
	import { cn } from '$lib/utils.js';

	/**
	 * One deep-search hit: a file, its olympiad and year, the problems it is
	 * attached to, and an excerpt.
	 *
	 * The anchor is a plain new-tab link to the CDN url, with no click
	 * interception, so middle-click and "Save link as" work. The dialog stays open
	 * so the user can come back to the list.
	 *
	 * Don't add a nested "go to year" link: `<a>` inside `<a>` is invalid markup.
	 * If one is wanted, use an `absolute inset-0` primary anchor under a
	 * `pointer-events-none` content wrapper.
	 */
	let {
		hit,
		index,
		focused,
		onhover
	}: {
		hit: FileSearchResult;
		/** This row's position in the list; see `SearchResultItem`. */
		index: number;
		/** Whether this is the row the keyboard is on. */
		focused: boolean;
		onhover: () => void;
	} = $props();

	/**
	 * The excerpt as marked and unmarked parts, rendered as real elements. Never
	 * `{@html}`: the text is an unescaped PDF body.
	 */
	const parts = $derived(splitMarks(hit.snippet, hit.matches));

	/** Capped so a whole-year PDF attached to every problem can't fill the row. */
	const SHOWN_PROBLEMS = 4;
	const shownProblems = $derived(hit.problems.slice(0, SHOWN_PROBLEMS));
	const extraProblems = $derived(Math.max(hit.problems.length - SHOWN_PROBLEMS, 0));
</script>

<li data-result-index={index}>
	<!-- eslint-disable svelte/no-navigation-without-resolve -- an absolute CDN url, opened in a new tab; there is nothing for resolve() to do -->
	<a
		href={hit.file.url}
		target="_blank"
		rel="noopener noreferrer"
		onmousemove={onhover}
		class={cn(
			'flex flex-col gap-1.5 border-b border-white/40 px-4 py-3 transition-all duration-150 last:border-0 motion-reduce:transition-none dark:border-white/8',
			focused ? 'bg-white/50 dark:bg-white/8' : 'hover:bg-white/35 dark:hover:bg-white/5'
		)}
	>
		<!-- No `query`: it matched the file's text, not this metadata. -->
		<ResultMeta
			olympiadId={hit.olympiadId}
			olympiadIcon={hit.olympiadIcon}
			olympiadName={hit.olympiadName}
			year={hit.year}
		>
			{#if hit.problems.length != 0}
				<span aria-hidden="true">·</span>
				<span class="font-mono">
					{shownProblems.map((p) => p.number).join(', ')}{extraProblems > 0
						? ` +${extraProblems}`
						: ''}
				</span>
			{/if}
		</ResultMeta>

		<!-- The file, then what it covers -->
		<div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
			<span class="flex items-center gap-1.5 font-medium text-foreground">
				<FileText class="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
				{hit.file.label}
			</span>
		</div>

		<p class="line-clamp-2 text-xs text-muted-foreground">
			{#each parts as part, i (i)}{#if part.marked}<mark>{part.text}</mark
					>{:else}{part.text}{/if}{/each}
		</p>
	</a>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
</li>

<style>
	/* Scoped, unlike SearchResultItem's: these marks are real elements. */
	mark {
		background: transparent;
		color: var(--primary);
		font-weight: 600;
	}
</style>
