<script lang="ts">
	import '../app.css';
	let { children } = $props();

	import SvelteSeo from 'svelte-seo';
	import { page } from '$app/state';
	import { browser } from '$app/environment';
	import { contests } from '../lib/pregen/contests';
	import { ModeWatcher } from 'mode-watcher';
	import DarkModeButton from '$lib/DarkModeButton.svelte';
	import HeaderLink from '$lib/HeaderLink.svelte';

	let contest = $derived(
		contests.find(
			(i) => i.id == page.url.pathname.split('/')[page.url.pathname.split('/').length - 1]
		)
	);
</script>

<!-- <svelte:head>
<base target="_blank">
</svelte:head> -->
{#if contest}
	<SvelteSeo
		title={contest.name}
		description="An archive of problems and solutions from the {contest.name}, in PDF format."
		keywords="problems, solutions, olympiad, physics"
	/>
{/if}

<ModeWatcher />

<div
	class="flex min-h-screen w-full flex-col items-center bg-background px-8 py-8 antialiased sm:px-10 sm:py-10"
>
	<div class="w-full md:w-5/6 xl:w-2/3">
		<nav class="flex flex-row items-center justify-between">
			<div class="my-3 flex flex-row gap-x-5 xs:gap-x-10">
				<HeaderLink url="/" label="home" />
				<HeaderLink url="/resources" />
				<HeaderLink url="/blog" />
			</div>
			{#if browser}
				<DarkModeButton />
			{/if}
		</nav>
		<main>
			{@render children()}
		</main>
	</div>
</div>
