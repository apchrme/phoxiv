<script lang="ts">
	import '../app.css';
	let { children } = $props();

	import SvelteSeo from 'svelte-seo';
	import { page } from '$app/state';
	import { contests } from '../lib/pregen/contests';
	import { mode, ModeWatcher } from 'mode-watcher';
	import DarkModeButton from '$lib/DarkModeButton.svelte';
	import HeaderLink from '$lib/HeaderLink.svelte';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import Button from '$lib/components/ui/button/button.svelte';

	import DiscordWhite from '$lib/assets/icons/Discord-Symbol-White.svg';
	import DiscordBlack from '$lib/assets/icons/Discord-Symbol-Black.svg';

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
			<div class="flex flex-row items-center gap-x-3">
				{#if mode.current == "dark" }
				<Button variant="outline" size="icon" href="https://discord.gg/SNBDY5nsgf" target="_blank"><img alt="Discord" src={DiscordWhite} class="scale-50 opacity-75"/></Button>
				{:else}
				<Button variant="outline" size="icon" href="https://discord.gg/SNBDY5nsgf" target="_blank"><img alt="Discord" src={DiscordBlack} class="scale-50 opacity-75"/></Button>
				{/if}
				<DarkModeButton />
			</div>
		</nav>
		<Separator class="my-1" />
		<main>
			{@render children()}
		</main>
	</div>
</div>
