<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils.js';

	/**
	 * The block at the top of a page: a heading, something explaining it, and
	 * optionally an icon beside them or controls opposite.
	 *
	 * This is `Title.svelte` grown up. `Title` served five pages; four more had
	 * hand-rolled their own header because they needed one thing it did not offer —
	 * an icon, a rich description, a coloured year, a second line — and in doing so
	 * arrived at four different vertical rhythms (`py-5 md:py-10`, `pt-3 md:pt-5`,
	 * `py-5` with `gap-2`, `py-5` with `gap-1`) and two heading sizes with no rule
	 * separating them.
	 *
	 * **One rhythm, and a rule for the two sizes.** A page you navigate *to* gets
	 * `'default'`; an editor you navigate *into*, under a `BackLink`, gets `'sm'`,
	 * because there the heading names the record being edited rather than the
	 * section of the site. Nothing else chooses.
	 */
	let {
		title,
		description,
		size = 'default',
		leading,
		titleSuffix,
		actions,
		class: className,
		children
	}: {
		title: string;
		/** Plain-text explanation. For anything richer, use `children` instead. */
		description?: string;
		/** See the header: `'sm'` is for an editor reached through a `BackLink`. */
		size?: 'default' | 'sm';
		/**
		 * Rendered to the left of the heading — an `OlympiadIcon`, sized by the
		 * caller. Named for its position rather than its contents, because `icon`
		 * everywhere else in this codebase is an olympiad's icon *string*, and a
		 * snippet by that name shadows the caller's own variable.
		 */
		leading?: Snippet;
		/** Rendered inside the `<h1>`, after the title — the year an editor is scoped to. */
		titleSuffix?: Snippet;
		/** Rendered opposite the heading, pushed to the end of the row. */
		actions?: Snippet;
		class?: string;
		/**
		 * The description, when it is more than one string: rendered markdown, a
		 * `<code>` path, an id under the name. Wins over `description` when both are
		 * given, which no caller should do.
		 */
		children?: Snippet;
	} = $props();
</script>

<header class={cn('flex flex-col gap-2 py-5 md:py-8', className)}>
	<div class="flex items-start gap-3">
		{#if leading}
			<div class="shrink-0">{@render leading()}</div>
		{/if}
		<div class="flex min-w-0 flex-col gap-1">
			<h1
				class={cn(
					'font-bold tracking-tight',
					size === 'sm' ? 'text-2xl' : 'text-3xl leading-tight sm:text-4xl'
				)}
			>
				{title}{#if titleSuffix}&nbsp;{@render titleSuffix()}{/if}
			</h1>
			{#if children}
				{@render children()}
			{:else if description}
				<p class="m-0 prose text-muted-foreground">{description}</p>
			{/if}
		</div>
		{#if actions}
			<div class="ml-auto shrink-0">{@render actions()}</div>
		{/if}
	</div>
</header>
