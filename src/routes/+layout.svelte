<script lang="ts">
	import '../app.css';
	let { children } = $props();

	import NavLink from './NavLink.svelte';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import { ModeWatcher } from 'mode-watcher';
	import * as NavigationMenu from '$lib/components/ui/navigation-menu/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import AppSidebar from './AppSidebar.svelte';
	import NavButtons from './NavButtons.svelte';
	import ScrollToTop from '$lib/components/ScrollToTop.svelte';
	import GlobalSearch from '$lib/components/GlobalSearch.svelte';
	import { Search } from '@lucide/svelte';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import * as Kbd from '$lib/components/ui/kbd/index.js';

	const navLinks = [
		{ url: '/', label: 'home' },
		{ url: '/contests', label: 'contests' },
		{ url: '/resources', label: 'resources' },
		{ url: '/blog', label: 'blog' }
	];

	let searchOpen = $state(false);
</script>

<svelte:head>
	<link rel="icon" href="/logo.svg?v=3" />
</svelte:head>

<ModeWatcher />
<GlobalSearch bind:open={searchOpen} />

<Sidebar.Provider>
	<AppSidebar {navLinks} />
	<div
		class="flex min-h-screen w-full flex-col items-center bg-background px-8 py-3 sm:px-10 sm:py-6"
	>
		<div class="w-full md:w-5/6 xl:w-2/3">
			<!-- Mobile nav -->
			<nav class="grid grid-cols-3 items-center md:hidden">
				<Sidebar.Trigger />
				<a
					href="/"
					class="justify-self-center text-base font-medium text-foreground hover:text-primary"
				>
					phoXiv
				</a>
				<button
					onclick={() => (searchOpen = true)}
					class="{buttonVariants({ variant: 'ghost', size: 'icon' })} justify-self-end"
					aria-label="Search problems"
				>
					<Search class="size-4" />
				</button>
			</nav>

			<!-- Desktop nav -->
			<nav class="hidden flex-row flex-wrap items-center justify-between gap-2 md:flex">
				<NavigationMenu.Root>
					<NavigationMenu.List class="gap-2 sm:gap-3">
						{#each navLinks as navLink (navLink.url)}
							<NavLink url={navLink.url} label={navLink.label} />
						{/each}
					</NavigationMenu.List>
				</NavigationMenu.Root>
				<div class="flex items-center gap-2">
					<button
						onclick={() => (searchOpen = true)}
						class="{buttonVariants({
							variant: 'outline'
						})} items-center gap-2 text-sm text-muted-foreground"
						aria-label="Search problems"
					>
						<Search class="size-4" />
						<span class="hidden lg:block">Search…</span>
						<Kbd.Root class="font-mono hidden lg:inline-flex">⌘</Kbd.Root>
						<Kbd.Root class="font-mono hidden lg:inline-flex">K</Kbd.Root>
					</button>
					<NavButtons />
				</div>
			</nav>

			<Separator class="my-3" />
			<main>
				{@render children?.()}
			</main>
		</div>
	</div>
</Sidebar.Provider>

<ScrollToTop />
