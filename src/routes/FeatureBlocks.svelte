<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Component } from 'svelte';
	import { ArrowRight, Award, HandHelping, Search, Trophy, type LucideProps } from '@lucide/svelte';
	import * as Kbd from '#lib/components/ui/kbd/index.js';

	/**
	 * What the site does. Admin features are left out; almost no visitor can use
	 * them. Only signed-out visitors see the landing page (signed-in ones get the
	 * dashboard), so the last two blocks always lead to `/login`.
	 */
	type Block = {
		/** Matches the nav's icon for the same destination, so the two agree. */
		icon: Component<LucideProps>;
		color: string;
		title: string;
		body: string;
		/** Absent on the search block: search is a dialog, not a route. */
		href?: string;
		cta?: string;
		shortcut?: boolean;
	};

	const blocks: Block[] = [
		{
			icon: Trophy,
			color: 'text-blue-500 dark:text-blue-300',
			title: 'Browse the archive',
			body: `Browse the most comprehensive archive on the internet. Dozens of olympiads and thousands of problems, each complete with solutions, marking schemes and more.`,
			href: resolve('olympiads'),
			cta: 'Browse olympiads'
		},
		{
			icon: Search,
			color: 'text-lime-500 dark:text-lime-300',
			title: 'Narrow it down',
			body: `The site includes a feature-packed search function that combs through files to find what you want. Combine this with topic and olympiad filters to find that perfect problem.`,
			shortcut: true
		},
		{
			icon: Award,
			color: 'text-violet-500 dark:text-violet-300',
			title: 'Earn shiny badges',
			body: `Mark any problem you have done, and include your score if you want. Earn cool badges along the way.`,
			href: resolve('login'),
			cta: 'Sign in to track'
		},
		{
			icon: HandHelping,
			color: 'text-amber-500 dark:text-amber-300',
			title: 'Contribute',
			body: `Don't see an olympiad you like here? Become a contributor and add it!`,
			href: resolve('login'),
			cta: 'Sign in to contribute'
		}
	];
</script>

<div class="flex flex-col gap-16 sm:gap-24">
	{#each blocks as block, i (block.title)}
		<!-- Alternating sides. The spans (3 + 9) must add up to 12, or leftover
		     columns always land on the right and the layout stops alternating. -->
		<div
			class="feature-block grid grid-cols-1 items-start gap-4 sm:grid-cols-12 sm:gap-8
			       {i % 2 === 1 ? 'sm:[&>*:first-child]:order-2' : ''}"
		>
			<!-- Flex, not text-align: Tailwind's preflight makes an svg `display: block`. -->
			<div class="flex sm:col-span-3 {i % 2 === 1 ? 'sm:justify-start' : 'sm:justify-end'}">
				<block.icon class="size-12 sm:size-18 {block.color}" strokeWidth="3" aria-hidden="true" />
			</div>

			<div
				class="flex flex-col gap-3 sm:col-span-9 {i % 2 === 1
					? 'sm:items-end sm:text-right'
					: 'sm:text-left'}"
			>
				<h2 class="m-0 text-2xl leading-tight font-[1000] tracking-tight {block.color} sm:text-3xl">
					{block.title}
				</h2>
				<p class="m-0 max-w-[52ch] text-base leading-relaxed text-foreground/75">
					{block.body}
				</p>

				{#if block.href}
					<!-- eslint-disable svelte/no-navigation-without-resolve -- already resolved in `blocks` above -->
					<a
						href={block.href}
						class="group mt-1 flex w-fit items-center gap-1 text-sm font-medium text-muted-foreground transition-all duration-150 hover:gap-2 hover:text-primary"
					>
						{block.cta}
						<ArrowRight class="size-4" />
					</a>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
				{:else if block.shortcut}
					<!-- Search is a dialog, so show its shortcut instead of a link. -->
					<div class="mt-1 flex w-fit items-center gap-2 text-sm text-muted-foreground">
						<span>Press</span>
						<Kbd.Root class="inline-flex">⌘</Kbd.Root>
						<Kbd.Root class="inline-flex">K</Kbd.Root>
						<span>/</span>
						<Kbd.Root class="inline-flex">Ctrl</Kbd.Root>
						<Kbd.Root class="inline-flex">K</Kbd.Root>
						<span>anywhere</span>
					</div>
				{/if}
			</div>
		</div>
	{/each}
</div>
