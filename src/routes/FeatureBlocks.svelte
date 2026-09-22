<script lang="ts">
	import { resolve } from '$app/paths';
	import { ArrowRight } from '@lucide/svelte';
	import * as Kbd from '$lib/components/ui/kbd/index.js';

	let {
		signedIn = false
	}: {
		/**
		 * Whether there is a session. Only affects where blocks 03 and 04 point:
		 * sending a signed-in visitor to `/login` is the same dead end the hero's
		 * second CTA already avoids.
		 */
		signedIn?: boolean;
	} = $props();

	/**
	 * The four things the site does, in the README's own order and words.
	 *
	 * "Administer it." is deliberately absent: it is admin-only, and a landing page
	 * that advertises a panel almost no visitor can open is advertising a locked
	 * door.
	 */
	type Block = {
		n: string;
		title: string;
		body: string;
		/** Present on every block that has somewhere to go. Block 02 does not — see below. */
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
			// Scoped to what was actually extracted, because block 04 says in the same
			// breath that a scan will not be searchable. Claiming "every document" here
			// and admitting the exception four blocks later is the same page
			// contradicting itself.
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
		<!-- Alternating sides, and asymmetric within the row: the numeral takes three of
		     twelve columns and the copy the remaining nine, so neither row is a centred
		     slab. The two spans have to add up to twelve — at 3 + 7 the leftover pair of
		     columns fell on the right of *every* row, which reads as the whole feature
		     list hanging left rather than as an alternating layout. -->
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
				<!-- DM Sans Variable carries weights to 1000 and nothing else in the app goes
				     past 700, so the display weight raises the ceiling without a second face. -->
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
					<!-- Search has no route of its own — it is a dialog on every page — so this
					     block ends with the shortcut that opens it rather than a link that would
					     have to point somewhere else. Both spellings, since half the visitors
					     are not on a Mac. -->
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
