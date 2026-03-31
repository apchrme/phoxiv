<script lang="ts">
	import SvelteSeo from 'svelte-seo';
	import HeroSection from '$lib/HeroSection.svelte';
	import ContestList from '$lib/ContestList.svelte';
</script>

<SvelteSeo
	title="phoXiv"
	description="An archive of problems and solutions from various physics olympiads. Includes IPhO, EuPhO, USAPhO, the Singapore Olympiads and the Hungarian Eotvos competition."
	keywords="problems, solutions, olympiad, physics, ipho, apho, eupho"
/>

<HeroSection />

<!-- Contests -->
<section id="contests" class="mb-5">
	<div class="mb-3 sm:mb-5">
		<h2 class="py-0">Contests</h2>
		<p class="mb-0 text-sm text-muted-foreground">
			Click any card to explore problems, solutions &amp; marking schemes.
		</p>
	</div>
	<ContestList />
</section>

<!-- Contribute CTA -->
<section class="">
	<div
		class="flex flex-col items-start justify-between gap-4 rounded-2xl bg-primary px-6 py-5 sm:flex-row sm:items-center"
	>
		<p class="mb-0 text-sm font-medium text-primary-foreground/90">
			Want to add problems or help maintain the site? Open a PR or reach out.
		</p>
		<a
			href="mailto:admin@phoxiv.org"
			class="shrink-0 rounded-lg bg-primary-foreground px-4 py-2 text-sm font-semibold text-primary transition-opacity hover:opacity-90"
		>
			Get in touch →
		</a>
	</div>
</section>
