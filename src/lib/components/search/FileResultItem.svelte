<script lang="ts">
	import type { FileSearchResult } from '$lib/types.js';
	import { splitMarks } from '$lib/utils/fuzzy';
	import OlympiadIcon from '$lib/components/OlympiadIcon.svelte';
	import { FileText } from '@lucide/svelte';
	import { cn } from '$lib/utils.js';

	/**
	 * One hit in deep search: a **file** that contains the phrase, the olympiad and
	 * year it belongs to, the problems it is attached to, and an excerpt.
	 *
	 * **A separate component, not a `kind` prop on `SearchResultItem`.** The two
	 * rows disagree on their primary action, their highlighting, their identity
	 * line and their coverage line; one component would be two with an `{#if}`
	 * around every row.
	 *
	 * # Activation: the anchor is left completely alone
	 *
	 * `href` is the absolute CDN url with `target="_blank"`, and there is **no
	 * `preventDefault` and no `onactivate`**. The target is not an internal
	 * navigation, so the browser should handle the click — which is also what keeps
	 * middle-click, ⌘-click and "Save link as" working, without any of
	 * `SearchResultItem`'s interception. The dialog stays **open**: the file opens
	 * in a new tab, so coming back should land on the same result list, which for
	 * "check the next hit" is the point.
	 *
	 * # There is deliberately no secondary "go to year" link
	 *
	 * That is a finding rather than a preference. `SearchResultItem` already nests
	 * `<a>` inside `<a>` through `FileBadge` — invalid markup the browser repairs
	 * by closing the outer anchor, which the compiler cannot see across the
	 * component boundary and is very likely why the `stopPropagation` there is
	 * load-bearing. Knowingly reproducing that shape is worse than losing an
	 * affordance problem mode already provides. If it is wanted later, the pattern
	 * is an `absolute inset-0` primary anchor under a `pointer-events-none` content
	 * wrapper.
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
	 * The excerpt, split into marked and unmarked parts.
	 *
	 * Real elements rather than an `{@html}` string, which is the whole reason the
	 * server sends offsets: the text is a PDF's body, and `snippet()` does not
	 * escape what surrounds a match. `splitMarks` skips any range it cannot trust,
	 * so a server-side change degrades to unmarked text rather than to a throw.
	 */
	const parts = $derived(splitMarks(hit.snippet, hit.matches));

	/**
	 * Capped so that a whole-year PDF attached to every problem individually cannot
	 * fill the row.
	 */
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
		<!-- Olympiad + year. **Deliberately not highlighted**: the query matched the
		     file's text, not its metadata, and marking the name would claim a match
		     that did not happen. -->
		<div class="flex items-center gap-1.5 text-muted-foreground">
			<OlympiadIcon
				icon={hit.olympiadIcon}
				id={hit.olympiadId}
				class="h-4 w-auto shrink-0 text-base"
			/>
			<span>{hit.olympiadName}</span>
			<span aria-hidden="true">·</span>
			<span class="font-mono">{hit.year}</span>
		</div>

		<!-- The file, then what it covers -->
		<div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
			<span class="flex items-center gap-1.5 font-medium text-foreground">
				<FileText class="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
				{hit.file.label}
			</span>
			{#if hit.problems.length === 0}
				<!-- An empty `problems` list *is* the year-level flag, and it is spelled
				     out because an absent list would just look like missing data. -->
				<span
					class="rounded-full border border-white/50 px-2 py-0.5 text-xs text-muted-foreground dark:border-white/10"
				>
					Whole year
				</span>
			{:else}
				<span class="font-mono text-xs font-semibold text-primary">
					{shownProblems.map((p) => p.number).join(', ')}{extraProblems > 0
						? ` +${extraProblems}`
						: ''}
				</span>
			{/if}
		</div>

		<p class="line-clamp-2 text-xs text-muted-foreground">
			{#each parts as part, i (i)}{#if part.marked}<mark>{part.text}</mark
					>{:else}{part.text}{/if}{/each}
		</p>
	</a>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
</li>

<style>
	/* A plain scoped rule, with no `:global` and no eslint-disable — the marks here
	   are real elements the compiler can see, unlike `SearchResultItem`'s, which
	   `uFuzzy.highlight` hands over as a string. */
	mark {
		background: transparent;
		color: var(--primary);
		font-weight: 600;
	}
</style>
