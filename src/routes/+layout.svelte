<script lang="ts">
	import '../app.css';
	let { children } = $props();

	import SvelteSeo from 'svelte-seo';
	import { page } from '$app/state';
	import { contests } from '../lib/pregen/contests';
	import DarkModeButton from '$lib/DarkModeButton.svelte';
	import NavLink from '$lib/NavLink.svelte';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import { ModeWatcher } from 'mode-watcher';
	import DiscordButton from '$lib/DiscordButton.svelte';
	import GitHubButton from '$lib/GitHubButton.svelte';
	import * as NavigationMenu from '$lib/components/ui/navigation-menu/index.js';

	let contest = $derived(
		contests.find(
			(i) => i.id == page.url.pathname.split('/')[page.url.pathname.split('/').length - 1]
		)
	);
</script>

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
		<nav class="flex flex-row flex-wrap items-center justify-center gap-2 xs:justify-between">
			<NavigationMenu.Root>
				<NavigationMenu.List class="gap-2 sm:gap-3">
					<NavLink url="/" label="home" />
					<NavLink url="/resources" />
					<NavLink url="/blog" />
					<NavigationMenu.Indicator />
				</NavigationMenu.List>
			</NavigationMenu.Root>
			<div class="flex flex-row items-center gap-3">
				<GitHubButton />
				<DiscordButton />
				<DarkModeButton />
			</div>
		</nav>

		<Separator class="my-3" />
		<main>
			{@render children()}
		</main>
	</div>
</div>
