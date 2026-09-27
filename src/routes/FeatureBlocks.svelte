<script lang="ts">
	import { resolve } from '$app/paths';
	import { ArrowRight } from '@lucide/svelte';
	import * as Kbd from '$lib/components/ui/kbd/index.js';

	let {
		signedIn = false
	}: {
		/** Points blocks 03 and 04 past `/login` for signed-in visitors. */
		signedIn?: boolean;
	} = $props();

	/** What the site does. Admin features are left out; almost no visitor can use them. */
	type Block = {
		n: string;
		title: string;
		body: string;
		/** Absent on block 02: search is a dialog, not a route. */
		href?: string;
		cta?: string;
		shortcut?: boolean;
	};

	const blocks: Block[] = $derived([
		{
			n: '01',
			title: 'Browse the archive',
			body: `Dozens of olympiads, each with problems, solutions, marking schemes and more.
			Pages are cached, so they are lightning-fast.`,
			href: resolve('/olympiads'),
			cta: 'Browse olympiads'
		},
		{
			n: '02',
			title: 'Search it two ways',
			body: `The site includes two different types of search. The default search allows you to find a problem you remember the number/title of. Can't remember that?
			Fret not. Deep search matches the text inside the PDFs, so you can search for problems that you remember a phrase from.`,
			shortcut: true
		},
		{
			n: '03',
			title: 'Track what you have solved',
			body: `Mark any problem you have done, optionally with a score, and see per-year totals. Filter by completion status to narrow down your search.`,
			href: signedIn ? resolve('/profile') : resolve('/login'),
			cta: signedIn ? 'See your progress' : 'Sign in to track'
		},
		{
			n: '04',
			title: 'Contribute',
			body: `Contributors edit the olympiads they are assigned: adding years, uploading and
			       labelling files, and editing problem metadata. Don't see an olympiad you like here? Become a contributor and add it!`,
			href: signedIn ? resolve('/contribute') : resolve('/login'),
			cta: signedIn ? 'Open the editor' : 'Sign in to contribute'
		}
	]);
</script>

<div class="flex flex-col gap-16 sm:gap-24">
	{#each blocks as block, i (block.n)}
		<!-- Alternating sides. The spans (3 + 9) must add up to 12, or leftover
		     columns always land on the right and the layout stops alternating. -->
		<div
			class="feature-block grid grid-cols-1 items-start gap-4 sm:grid-cols-12 sm:gap-8
			       {i % 2 === 1 ? 'sm:[&>*:first-child]:order-2' : ''}"
		>
			<div class="sm:col-span-3 {i % 2 === 1 ? 'sm:text-left' : 'sm:text-right'}">
				<span class="font-mono text-5xl leading-none text-foreground/15 tabular-nums sm:text-7xl">
					{block.n}
				</span>
			</div>

			<div
				class="flex flex-col gap-3 sm:col-span-9 {i % 2 === 1
					? 'sm:items-end sm:text-right'
					: 'sm:text-left'}"
			>
				<h2
					class="m-0 text-3xl leading-tight font-[1000] tracking-tight text-foreground sm:text-4xl"
				>
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
