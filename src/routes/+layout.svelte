<script lang="ts">
	import '../app.css';
	let { children } = $props();

	import SvelteSeo from 'svelte-seo';
	import { page } from '$app/state';
	import { browser } from '$app/environment';
	import { contests } from '../pregen/contests';
	import DarkModeButton from '$lib/DarkModeButton.svelte';
	import HeaderLink from '$lib/HeaderLink.svelte';

	let dark: boolean = $state(true);
	let systemDark: boolean = $state(true);
	let theme = $state('system');
	let contest = $derived(contests.find((i) => i.id == page.url.pathname.substring(1)));

	// Svelte does server-side rendering, followed by client-side rendering. localStorage is only accessible on the client render, so we have to remove it on the server render.
	if (browser) {
		systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
		if ('theme' in localStorage && localStorage.theme != 'system') {
			theme = localStorage.theme;
			dark = localStorage.theme == 'dark';
		} else {
			theme = 'system';
			dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
		}
		$effect(() => {
			localStorage.theme = theme;
		});
	}

	function toggleDarkTheme() {
		if (theme == 'dark') {
			dark = false;
			theme = 'light';
		} else if (theme == 'light') {
			theme = 'system';
			dark = systemDark;
		} else {
			dark = true;
			theme = 'dark';
		}
	}
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
<div
	class="{dark
		? 'mocha'
		: 'latte'} flex min-h-screen w-full flex-col items-center bg-ctp-base px-8 py-8 antialiased sm:px-10 sm:py-10 {dark
		? 'dark'
		: ''}"
>
	<div class="w-full md:w-5/6 xl:w-2/3">
		<nav class="flex flex-row items-center justify-between">
			<div class="my-3 flex flex-row gap-x-5 xs:gap-x-10">
				<HeaderLink url="/" label="home" />
				<HeaderLink url="/resources" />
				<HeaderLink url="/blog" />
			</div>
			{#if browser}
				<DarkModeButton {systemDark} {theme} {toggleDarkTheme} />
			{/if}
		</nav>
		<main>
			{#if contest}
				<h2>{contest.name}</h2>
			{/if}
			{@render children()}
		</main>
	</div>
</div>
