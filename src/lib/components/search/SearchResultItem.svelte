<script lang="ts">
	import type { SearchItem } from '$lib/types.js';
	import { highlight } from '$lib/utils/fuzzy';
	import FileBadge from '$lib/components/FileBadge.svelte';
	import ResultMeta from './ResultMeta.svelte';
	import { cn } from '$lib/utils.js';
	import { resolve } from '$app/paths';

	/**
	 * One problem-search hit: olympiad and year, the problem, and links to its
	 * files.
	 *
	 * The shell owns focus; this only reports hover via `onhover`. Don't write a
	 * non-`$bindable` prop here: Svelte 5 allows it but the write doesn't
	 * propagate.
	 *
	 * The link keeps a real `href` for middle-click, but a plain click is
	 * intercepted because navigating must also close the dialog.
	 */
	let {
		item,
		query,
		index,
		focused,
		onactivate,
		onhover
	}: {
		item: SearchItem;
		/** The live query, used to mark the characters that matched. */
		query: string;
		/**
		 * This row's position, mirrored onto the `<li>` as `data-result-index`.
		 * The shell scrolls by that attribute, not `querySelectorAll('li')[i]`, so
		 * a non-result `<li>` can't shift the indices.
		 */
		index: number;
		/** Whether this is the row the keyboard is on. */
		focused: boolean;
		onactivate: () => void;
		onhover: () => void;
	} = $props();
</script>

<li data-result-index={index}>
	<a
		href={resolve(`/olympiads/${item.olympiadId}#${item.year}`)}
		onclick={(e) => {
			e.preventDefault();
			onactivate();
		}}
		onmousemove={onhover}
		class={cn(
			'flex flex-col gap-1.5 border-b border-white/40 px-4 py-3 transition-all duration-150 last:border-0 motion-reduce:transition-none dark:border-white/8',
			focused ? 'bg-white/50 dark:bg-white/8' : 'hover:bg-white/35 dark:hover:bg-white/5'
		)}
	>
		<!-- `query` given: the query really ran over this text. -->
		<ResultMeta
			olympiadId={item.olympiadId}
			olympiadIcon={item.olympiadIcon}
			olympiadName={item.olympiadName}
			year={item.year}
			{query}
		/>

		<!-- Problem number + title -->
		<div class="flex items-baseline gap-2">
			<span class="font-mono font-semibold text-primary">
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html highlight(item.problem.number, query)}
			</span>
			{#if item.problem.title}
				<span class="font-medium text-foreground">
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					{@html highlight(item.problem.title, query)}
				</span>
			{/if}
		</div>

		{#if item.problem.files.length > 0}
			<div class="flex flex-wrap gap-1.5">
				{#each item.problem.files as file (file.label)}
					<!-- The badge sits inside the row's link; stop its click from also navigating the row. -->
					<FileBadge
						href={file.url}
						label={file.label}
						class="px-2 py-1 text-xs"
						onclick={(e) => e.stopPropagation()}
					/>
				{/each}
			</div>
		{/if}
	</a>
</li>

<style>
	/* `highlight()` injects <mark> through {@html}, which the compiler never sees,
	   so it can only be styled globally. */
	:global(mark) {
		background: transparent;
		color: var(--primary);
		font-weight: 600;
	}
</style>
