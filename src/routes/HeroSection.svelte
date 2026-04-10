<script lang="ts">
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import { cn } from '$lib/utils.js';
	import contests from "$lib/pregen/contests.json";

	const stats = [
		{ value: contests.length, label: 'olympiads' },
		{ value: '1200+', label: 'files' }
	] as const;
</script>

<section class="my-5 sm:my-8">
	<!-- Title -->
	<div class="mb-3 flex flex-col items-start gap-1">
		<h1 class="my-2 p-0 text-left text-5xl sm:text-6xl">phoXiv</h1>
		<p class="mb-0 text-left text-sm text-muted-foreground">/ foʊkaɪv /</p>
	</div>

	<!-- Description -->
	<p class="my-5 max-w-prose text-left text-base leading-relaxed text-foreground/80">
		A comprehensive archive of physics olympiads — from the well-known IPhO and EuPhO to hidden gems
		like the Eötvös competition. Includes marking schemes and answer sheets you rarely find
		elsewhere, in a mobile-friendly UI.
	</p>

	<!-- CTAs -->
	<div class="my-5 flex flex-wrap gap-3 sm:mb-8">
		<a href="#contests" class={cn(buttonVariants({ variant: 'default' }))}>Browse contests</a>
		<a href="https://github.com/apchrme/phoxiv" class={cn(buttonVariants({ variant: 'outline' }))}>
			Contribute
		</a>
	</div>

	<!-- Stats strip -->
	<div
		class="flex w-fit flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-border bg-card px-5 py-3"
	>
		{#each stats as stat, i (stat.label)}
			<div class="flex flex-col gap-0.5">
				<span class="font-mono text-lg leading-none font-semibold text-foreground"
					>{stat.value}</span
				>
				<span class="text-xs text-muted-foreground">{stat.label}</span>
			</div>
			{#if i < stats.length - 1}
				<div class="hidden h-7 w-px bg-border sm:block"></div>
			{/if}
		{/each}
	</div>
</section>
