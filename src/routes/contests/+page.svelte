<script lang="ts">
	import ContestList from './ContestList.svelte';
</script>

<!-- Contests -->
<section id="contests" class="mb-4">
	<div class="mb-4">
		<h1 class="py-0">Contests</h1>
		<p class="mb-0 text-base text-center text-muted-foreground">
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