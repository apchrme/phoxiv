<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils.js';

	/**
	 * The heading block at the top of a page, with optional icon and actions.
	 * Size rule: `'default'` for pages you navigate to; `'sm'` for editors
	 * reached through a `BackLink`, where the heading names the record.
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
		/** Plain-text explanation. For anything richer, use `children`. */
		description?: string;
		/** `'sm'` for an editor reached through a `BackLink`. */
		size?: 'default' | 'sm';
		/**
		 * Left of the heading, usually an `OlympiadIcon`. Not called `icon`, which
		 * elsewhere means an olympiad's icon string and would shadow it.
		 */
		leading?: Snippet;
		/** Inside the `<h1>`, after the title, e.g. the year being edited. */
		titleSuffix?: Snippet;
		/** Opposite the heading, at the end of the row. */
		actions?: Snippet;
		class?: string;
		/** A rich description. Replaces `description` if both are given. */
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
