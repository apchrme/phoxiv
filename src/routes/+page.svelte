<script lang="ts">
	import { resolve } from '$app/paths';
	import SvelteSeo from 'svelte-seo';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import { cn } from '$lib/utils.js';
	import logo from '$lib/assets/branding/logo.svg';
	import { onMount } from 'svelte';


	let rotX = $state(12);
	let rotY = $state(-18);

	function handleMouseMove(e: MouseEvent) {
		const cx = window.innerWidth / 2;
		const cy = window.innerHeight / 2;
		rotY = ((e.clientX - cx) / cx) * 25;
		rotX = -((e.clientY - cy) / cy) * 18;
	}

	let stats:Record<string, number>= $state({"olympiads":0,"years":0,"files":0});

	onMount(async () => {
		stats = await(await fetch("/api/stats")).json();
	})

	const statItems = $derived([
		{ value: stats.olympiads, label: 'Olympiads' },
		{ value: stats.years, label: 'Years' },
		{ value: stats.files, label: 'Files' }
	]);
</script>

<SvelteSeo
	title="phoXiv"
	description="An archive of problems and solutions from various physics olympiads. Includes IPhO, EuPhO, USAPhO, the Singapore Olympiads, the Hungarian Eötvös competition and more."
	keywords="problems, solutions, olympiad, physics, ipho, apho, eupho, singapore, eotvos"
/>

<svelte:window onmousemove={handleMouseMove} />

<div
	class="relative flex min-h-[calc(100svh-10rem)] flex-col items-center justify-center gap-8 py-12 md:flex-row md:items-center md:justify-between"
>
	<!-- Mobile: static logo in background -->
	<div
		class="pointer-events-none absolute inset-0 flex items-center justify-around overflow-hidden md:hidden"
		aria-hidden="true"
	>
		<img
			src={logo}
			alt=""
			class="h-112 w-md mask-[radial-gradient(ellipse_at_center,black,transparent_100%)] opacity-20 select-none"
		/>
	</div>

	<!-- Left: text content -->
	<div class="hero-text relative z-10 flex min-w-0 flex-1 flex-col justify-center gap-7">
		<!-- Title -->
		<div class="flex flex-col gap-1">
			<h1 class="mb-2 text-[clamp(4rem,10vw,7rem)] leading-none font-bold tracking-[-0.03em]">
				phoXiv
			</h1>
			<span class="font-mono text-sm tracking-[0.02em] text-muted-foreground">/ foʊkaɪv /</span>
		</div>

		<!-- Description -->
		<p class="m-0 prose max-w-[44ch] text-foreground/70">
			A comprehensive archive of physics olympiads, from the well-known IPhO and EuPhO to hidden
			gems like the Eötvös competition. Includes marking schemes and answer sheets you rarely find
			elsewhere, all in a mobile-friendly interface.
		</p>

		<!-- CTAs -->
		<div class="flex flex-wrap gap-3">
			<a href={resolve('/olympiads')} class={cn(buttonVariants({ variant: 'default' }))}
				>Browse olympiads</a
			>
			<a
				href="/contribute"
				class={cn(buttonVariants({ variant: 'outline' }))}
			>
				Contribute
			</a>
		</div>

		<!-- Stats -->
		<div class="flex flex-wrap items-center gap-6">
			{#each statItems as { value, label }, i (label)}
				<div class="flex flex-col gap-0.5">
					<span class="font-mono text-[1.75rem] leading-none font-bold text-foreground"
						>{value}</span
					>
					<span class="font-mono text-[0.65rem] tracking-widest text-muted-foreground uppercase"
						>{label}</span
					>
				</div>
				{#if i < statItems.length - 1}
					<div class="block h-8 w-px bg-border" aria-hidden="true"></div>
				{/if}
			{/each}
		</div>
	</div>

	<!-- Right: interactive 3-D logo (desktop only) -->
	<div class="hero-logo hidden shrink-0 items-center justify-center md:flex" aria-hidden="true">
		<div
			class="relative flex h-[clamp(16rem,28vw,26rem)] w-[clamp(16rem,28vw,26rem)] items-center justify-center [transition:transform_0.08s_ease-out] transform-3d"
			style="transform: perspective(900px) rotateX({rotX}deg) rotateY({rotY}deg);"
		>
			<!-- Glow ring behind logo -->
			<div
				class="absolute inset-0 transform-[translateZ(-20px)] rounded-full [background:radial-gradient(circle_at_center,color-mix(in_oklab,var(--primary)_40%,transparent),transparent_50%)]"
			></div>

			<!-- Logo -->
			<img
				src={logo}
				alt=""
				class="pointer-events-none h-full w-full transform-[translateZ(30px)] object-contain opacity-80 select-none dark:opacity-60"
			/>
		</div>
	</div>
</div>

<style>
	@keyframes fade-up {
		from {
			opacity: 0;
			translate: 0 1.25rem;
		}
		to {
			opacity: 1;
			translate: 0 0;
		}
	}

	@keyframes fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.hero-text {
		animation: fade-up 600ms ease-in-out both;
	}

	.hero-logo {
		animation: fade-in 800ms ease-in-out 300ms both;
	}
</style>
