<script lang="ts">
	import { resolve } from '$app/paths';
	import SvelteSeo from 'svelte-seo';
	import { Button } from '$lib/components/ui/button/index.js';
	import brand from '$lib/assets/branding/brand.svg';
	import logo from '$lib/assets/branding/logo.svg';
	import { onMount } from 'svelte';
	import { Resource } from '$lib/resource.svelte';
	import GitHubButton from '$lib/components/buttons/GitHubButton.svelte';
	import DiscordButton from '$lib/components/buttons/DiscordButton.svelte';
	import { gsap } from 'gsap';
	import { ScrollTrigger } from 'gsap/ScrollTrigger';
	import CorpusBand from './CorpusBand.svelte';
	import FeatureBlocks from './FeatureBlocks.svelte';
	import type { PageProps } from './$types';

	const { data }: PageProps = $props();

	/**
	 * Null until the counts arrive, and on failure. Don't seed it with zeroes, or
	 * a failed fetch shows an empty archive.
	 */
	const stats = new Resource<Record<string, number>>('/api/stats');

	onMount(() => void stats.loadOnce());

	const statItems = $derived([
		{ value: stats.value?.olympiads, label: 'Olympiads' },
		{ value: stats.value?.years, label: 'Years' },
		{ value: stats.value?.files, label: 'Files' }
	]);

	let pageRoot: HTMLElement | undefined = $state();
	onMount(() => {
		if (!pageRoot) return;

		gsap.registerPlugin(ScrollTrigger);

		// Respect prefers-reduced-motion: keep the reveals, just make them instant.
		const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		const dur = (d: number) => (reduceMotion ? 0 : d);

		const ctx = gsap.context(() => {
			// Hide synchronously so nothing flashes before the reveal.
			gsap.set(
				['.hero-brand', '.hero-phonetic', '.hero-headline', '.hero-desc', '.hero-cta', '.stat'],
				{
					autoAlpha: 0,
					y: 20
				}
			);
			gsap.set('.stat-item', { autoAlpha: 0, y: 30 });

			gsap
				.timeline({ defaults: { ease: 'power3.out' } })
				.to('.hero-brand', { autoAlpha: 1, y: 0, duration: dur(0.6) })
				.to('.hero-phonetic', { autoAlpha: 1, y: 0, duration: dur(0.6) }, '-=0.5')
				.to('.hero-headline', { autoAlpha: 1, y: 0, duration: dur(0.6) }, '-=0.5')
				.to('.hero-desc', { autoAlpha: 1, y: 0, duration: dur(0.6) }, '-=0.5')
				.to(
					'.hero-cta',
					{ autoAlpha: 1, y: 0, duration: dur(0.5), stagger: dur(0.1), ease: 'power3.out' },
					'-=0.5'
				)
				.to('.stat', { autoAlpha: 1, y: 0, duration: dur(0.5) }, '-=0.5')
				.to(
					'.stat-item',
					{ autoAlpha: 1, y: 0, duration: dur(0.7), stagger: dur(0.12), ease: 'power3.out' },
					'-=0.4'
				);

			// Scroll reveals. The context is rooted at `pageRoot`, so these selectors
			// reach into CorpusBand and FeatureBlocks. Keep using `dur()`, not
			// skipping the tweens: under reduced motion the sections would stay hidden.
			const revealed = ['.corpus-lede', '.corpus-band', '.feature-block', '.closing'];
			gsap.set(revealed, { autoAlpha: 0, y: 30 });

			for (const el of gsap.utils.toArray<HTMLElement>(revealed)) {
				gsap.to(el, {
					autoAlpha: 1,
					y: 0,
					duration: dur(0.7),
					ease: 'power3.out',
					// `once`, so nothing re-hides when scrolling back up.
					scrollTrigger: { trigger: el, start: 'top 88%', once: true }
				});
			}
		}, pageRoot);

		return () => ctx.revert();
	});
</script>

<SvelteSeo
	title="phoXiv"
	description="An archive of problems and solutions from various physics olympiads. Includes IPhO, EuPhO, USAPhO, the Singapore Olympiads, the Hungarian Eötvös competition and more."
	keywords="problems, solutions, olympiad, physics, ipho, apho, eupho, singapore, eotvos"
/>

<div bind:this={pageRoot} class="flex flex-col">
	<!-- Hero. Shorter than the viewport so the corpus band shows above the fold. -->
	<section
		class="relative flex min-h-[calc(100svh-20rem)] flex-col items-center justify-center gap-5 py-6 text-center"
	>
		<!-- Blurred logo watermark -->
		<div
			class="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
			aria-hidden="true"
		>
			<img
				src={logo}
				alt=""
				class="h-120 w-md opacity-40 select-none dark:opacity-10"
				style="filter: blur(2px);"
			/>
		</div>

		<div class="hero-brand relative z-10 flex flex-col items-center gap-2">
			<img src={brand} alt="phoXiv" class="w-[50vw] max-w-md" />
			<span class="hero-phonetic font-mono text-sm tracking-[0.02em] text-muted-foreground">
				/ foʊkaɪv /
			</span>
		</div>

		<!-- Weight 1000 is the display weight; the rest of the app stops at 700. -->
		<h1
			class="hero-headline relative z-10 m-0 max-w-[30ch] text-3xl leading-[1.05] font-[1000] tracking-tight text-balance text-foreground sm:text-5xl"
		>
			Every olympiad. One place.
		</h1>

		<p class="hero-desc relative z-10 m-0 prose max-w-[46ch] text-foreground/75">
			A comprehensive archive of physics olympiads, from the well-known IPhO and EuPhO to hidden
			gems like the Eötvös competition. Includes marking schemes and answer sheets you rarely find
			elsewhere, all in a mobile-friendly interface.
		</p>

		<!-- CTAs -->
		<div class="relative z-10 flex flex-col justify-center gap-3 xs:flex-row">
			<div class="hero-cta flex flex-row justify-center gap-2">
				<Button href={resolve('/olympiads')}>Browse olympiads</Button>

				<Button
					href={data.user ? resolve('/contribute') : resolve('/login')}
					variant="outline"
					class="border-white/60 bg-white/40 backdrop-blur-sm hover:bg-white/60 dark:border-white/15 dark:bg-white/5 dark:hover:bg-white/10"
				>
					{data.user ? 'Contribute' : 'Login'}
				</Button>
			</div>
			<div class="hero-cta flex flex-row justify-center gap-2">
				<GitHubButton /><DiscordButton />
			</div>
		</div>

		<div class="stat mx-auto flex w-[80vw] max-w-md flex-row overflow-hidden rounded-2xl glass">
			{#each statItems as { value, label }, i (label)}
				<div class="stat-item flex flex-1 flex-col items-center gap-1.5 px-4 py-4">
					<span class="font-mono text-2xl leading-none font-bold text-foreground tabular-nums">
						{value ?? '—'}
					</span>
					<span class="font-mono text-xs tracking-widest text-muted-foreground uppercase">
						{label}
					</span>
				</div>
				{#if i < statItems.length - 1}
					<div class="h-auto w-px self-stretch bg-border/60" aria-hidden="true"></div>
				{/if}
			{/each}
		</div>
	</section>

	<!-- Corpus band -->
	<section class="flex flex-col gap-5 pb-20 sm:pb-28">
		<div class="corpus-lede flex flex-col gap-1.5">
			<h2
				class="m-0 text-center text-2xl leading-tight font-[1000] tracking-tight text-foreground sm:text-3xl"
			>
				Thousands of problems, at your fingertips
			</h2>
		</div>

		<CorpusBand />
	</section>

	<!-- Features -->
	<section class="pb-20 sm:pb-28">
		<FeatureBlocks signedIn={!!data.user} />
	</section>

	<!-- Closing CTA -->
	<section class="closing flex flex-col items-center gap-5 py-16 text-center sm:py-24">
		<h2
			class="m-0 max-w-[16ch] text-3xl leading-[1.05] font-[1000] tracking-tight text-balance text-foreground sm:text-5xl"
		>
			Go find a problem.
		</h2>
		<p class="m-0 max-w-[44ch] text-base text-foreground/75">Your journey begins here.</p>
		<Button href={resolve('/olympiads')} size="lg">Browse olympiads</Button>
	</section>
</div>
