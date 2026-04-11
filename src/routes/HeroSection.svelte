<script lang="ts">
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import contests from '$lib/pregen/contests.json';
	import filesData from '$lib/pregen/files.json';
	import { cn } from '$lib/utils.js';
	import logo from '$lib/assets/branding/logo.svg';

	const fileCount = Object.values(filesData).flat().reduce((total, year) => {
		return (
			total +
			Object.keys(year.yearFiles).length +
			year.problems.reduce((n, p) => n + Object.keys(p.files).length, 0)
		);
	}, 0);

	const stats = [
		{ value: contests.length, label: 'olympiads' },
		{ value: fileCount, label: 'files' }
	];
</script>

<section class="relative my-6 overflow-hidden rounded-2xl border border-border bg-card px-8 py-10 sm:my-10 sm:px-12 sm:py-14">

	<!-- Decorative background logo (behind content) -->
	<img src={logo} alt="" aria-hidden="true" class="pointer-events-none select-none absolute max-w-none -top-7 -right-18 z-0 h-136 w-136 opacity-20 dark:opacity-10 mask-[linear-gradient(to_right,transparent,black_35%)]" />

	<!-- Content sits above the logo -->
	<div class="relative z-10">
		<!-- Title -->
		<div class="mb-3 flex flex-col items-start gap-1">
			<h1 class="text-left text-5xl sm:text-7xl">phoXiv</h1>
			<p class="mb-0 font-mono text-xs text-muted-foreground">/ foʊkaɪv /</p>
		</div>

		<!-- Description -->
		<p class="my-5 max-w-prose text-left text-base leading-relaxed text-foreground/75">
			A comprehensive archive of physics olympiads — from the well-known IPhO and EuPhO to hidden
			gems like the Eötvös competition. Includes marking schemes and answer sheets you rarely find elsewhere.
		</p>

		<!-- CTAs -->
		<div class="mb-8 flex flex-wrap gap-3">
			<a href="#contests" class={cn(buttonVariants({ variant: 'default' }))}>Browse contests</a>
			<a href="https://github.com/apchrme/phoxiv" class={cn(buttonVariants({ variant: 'outline' }))}>
				Contribute
			</a>
		</div>

		<!-- Stats strip -->
		<div class="flex w-fit flex-wrap items-center gap-x-6 gap-y-3">
			{#each stats as stat, i (stat.label)}
				<div class="flex flex-col gap-0.5">
					<span class="font-mono text-2xl font-bold leading-none text-foreground">
						{stat.value}
					</span>
					<span class="font-mono text-xs text-muted-foreground uppercase tracking-wider">
						{stat.label}
					</span>
				</div>
				{#if i < stats.length - 1}
					<div class="hidden h-8 w-px bg-border sm:block"></div>
				{/if}
			{/each}
		</div>
	</div>
</section>
