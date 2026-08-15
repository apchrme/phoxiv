<script lang="ts">
	import { resolve } from '$app/paths';
	import SvelteSeo from 'svelte-seo';
	import { Button } from '$lib/components/ui/button/index.js';
	import brand from '$lib/assets/branding/brand.svg';
	import logo from '$lib/assets/branding/logo.svg';
	import { onMount } from 'svelte';
	import GitHubButton from '$lib/components/buttons/GitHubButton.svelte';
	import DiscordButton from '$lib/components/buttons/DiscordButton.svelte';
	import { gsap } from 'gsap';
	import { ScrollTrigger } from 'gsap/ScrollTrigger';
	import type { PageProps } from './$types';

	const { data }: PageProps = $props();

	// ---------------------------------------------------------------------------
	// Stats — fetched once on mount
	// ---------------------------------------------------------------------------

	/**
	 * Null until the counts arrive, and left null if they never do.
	 *
	 * Seeding this with zeroes meant a failed request rendered a confident
	 * "0 / 0 / 0" — the archive claiming to be empty — with the reveal animation
	 * playing over it as though nothing were wrong.
	 */
	let stats = $state<Record<string, number> | null>(null);

	onMount(async () => {
		try {
			const res = await fetch('/api/stats');
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			stats = await res.json();
		} catch {
			stats = null;
		}
	});

	const statItems = $derived([
		{ value: stats?.olympiads, label: 'Olympiads' },
		{ value: stats?.years, label: 'Years' },
		{ value: stats?.files, label: 'Files' }
	]);

	let pageRoot: HTMLElement | undefined = $state();
	onMount(() => {
		if (!pageRoot) return;

		gsap.registerPlugin(ScrollTrigger);

		// Respect prefers-reduced-motion: keep the reveals, just make them instant.
		const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		const dur = (d: number) => (reduceMotion ? 0 : d);

		const ctx = gsap.context(() => {
			// Hide everything up front (synchronously) so there's no flash of visible
			// content before the reveal timelines run.
			gsap.set(['.hero-brand', '.hero-phonetic', '.hero-desc', '.hero-cta', '.stat'], {
				autoAlpha: 0,
				y: 20
			});
			gsap.set('.stat-item', { autoAlpha: 0, y: 30 });

			// Hero entrance — brand mark, phonetic spelling, description, then CTAs in a stagger
			gsap
				.timeline({ defaults: { ease: 'power3.out' } })
				.to('.hero-brand', { autoAlpha: 1, y: 0, duration: dur(0.6) })
				.to('.hero-phonetic', { autoAlpha: 1, y: 0, duration: dur(0.6) }, '-=0.5')
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
	<!-- ============================================================= -->
	<!-- Hero section — centered title, no interactive 3-D logo        -->
	<!-- ============================================================= -->
	<section
		class="relative flex min-h-[calc(100svh-10rem)] flex-col items-center justify-center gap-7 py-12 text-center"
	>
		<!-- Blurred logo watermark, kept purely as atmosphere -->
		<div
			class="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
			aria-hidden="true"
		>
			<img
				src={logo}
				alt=""
				class="h-120 w-md dark:opacity-10 opacity-40 select-none"
				style="filter: blur(2px);"
			/>
		</div>

		<!-- Title -->
		<div class="hero-brand relative z-10 flex flex-col items-center gap-2">
			<img src={brand} alt="phoXiv" class="w-[50vw] max-w-lg" />
			<span class="hero-phonetic font-mono text-sm tracking-[0.02em] text-muted-foreground">
				/ foʊkaɪv /
			</span>
		</div>

		<!-- Description -->
		<p class="hero-desc relative z-10 m-0 prose max-w-[46ch] text-foreground/75">
			A comprehensive archive of physics olympiads, from the well-known IPhO and EuPhO to hidden
			gems like the Eötvös competition. Includes marking schemes and answer sheets you rarely find
			elsewhere, all in a mobile-friendly interface.
		</p>

		<!-- CTAs -->
		<div class="relative z-10 flex xs:flex-row flex-col justify-center gap-3">
			<div class="hero-cta flex flex-row justify-center gap-2">
				<Button href={resolve('/olympiads')}>Browse olympiads</Button>

				<!-- Signed-in visitors get taken straight to the editor instead of the login page. -->
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

		<div class="stat glass mx-auto flex w-[80vw] max-w-md flex-row overflow-hidden rounded-2xl">
			{#each statItems as { value, label }, i (label)}
				<div class="stat-item flex flex-1 flex-col items-center gap-1 px-4 py-4">
					<span class="font-mono text-xl leading-none font-bold text-foreground">
						{value ?? '—'}
					</span>
					<span class="font-mono text-xs tracking-widest text-muted-foreground uppercase">
						{label}
					</span>
				</div>
				{#if i < statItems.length - 1}
					<div class="self-stretch bg-border/60 h-auto w-px" aria-hidden="true"></div>
				{/if}
			{/each}
		</div>
	</section>
</div>
