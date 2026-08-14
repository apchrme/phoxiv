<script lang="ts">
	import type { SearchItem } from '$lib/types.js';
	import { highlight } from '$lib/utils/fuzzy';
	import Badge from '$lib/components/ui/badge/badge.svelte';
	import OlympiadIcon from '$lib/components/OlympiadIcon.svelte';
	import { cn } from '$lib/utils.js';
	import { resolve } from '$app/paths';

	/**
	 * One hit in the global search list: the olympiad and year it belongs to, the
	 * problem, and direct links to its files.
	 *
	 * Focus is owned entirely by the shell — this component reports hover through
	 * `onhover` instead of writing the focused index itself. Svelte 5 lets a
	 * component reassign a non-`$bindable` prop with neither an error nor a
	 * warning, and the write silently fails to propagate; keeping every write on
	 * one side of the boundary removes the chance of tripping over that.
	 *
	 * The link keeps a real `href` so middle-click and "open in new tab" behave,
	 * but a plain click is intercepted because navigating also has to close the
	 * dialog.
	 */
	let {
		item,
		query,
		focused,
		onactivate,
		onhover
	}: {
		item: SearchItem;
		/** The live query, used to mark the characters that matched. */
		query: string;
		/** Whether this is the row the keyboard is on. */
		focused: boolean;
		onactivate: () => void;
		onhover: () => void;
	} = $props();
</script>

<li>
	<a
		href={resolve(`/olympiads/${item.olympiadId}#${item.year}`)}
		onclick={(e) => {
			e.preventDefault();
			onactivate();
		}}
		onmousemove={onhover}
		class={cn(
			'flex flex-col gap-1.5 border-b border-white/40 px-4 py-3 transition-all duration-150 last:border-0 dark:border-white/8',
			focused ? 'bg-white/50 dark:bg-white/8' : 'hover:bg-white/35 dark:hover:bg-white/5'
		)}
	>
		<!-- Olympiad + year -->
		<div class="flex items-center gap-1.5 text-muted-foreground">
			<OlympiadIcon
				icon={item.olympiadIcon}
				id={item.olympiadId}
				class="h-4 w-auto shrink-0 text-base"
			/>
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			<span>{@html highlight(item.olympiadName, query)}</span>
			<span aria-hidden="true">·</span>
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			<span class="font-mono">{@html highlight(String(item.year), query)}</span>
		</div>

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
					<Badge
						variant="outline"
						href={file.url}
						target="_blank"
						class="px-2 py-1 text-xs"
						onclick={(e: MouseEvent) => e.stopPropagation()}
					>
						{file.label}
					</Badge>
				{/each}
			</div>
		{/if}
	</a>
</li>

<style>
	/* `highlight()` injects <mark> through {@html}, so the markup never passes
	   through the compiler and can only be styled globally. The rule lives here,
	   with the only markup that renders it. */
	:global(mark) {
		background: transparent;
		color: var(--primary);
		font-weight: 600;
	}
</style>
