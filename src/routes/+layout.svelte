<script lang="ts">
	import '../app.css';
	let { children } = $props();

	import NavLink from '$lib/components/NavLink.svelte';
	import Separator from '$lib/components/ui/separator/separator.svelte';
	import { ModeWatcher } from 'mode-watcher';
	import * as NavigationMenu from '$lib/components/ui/navigation-menu/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import AppSidebar from '$lib/components/AppSidebar.svelte';
	import NavButtons from './NavButtons.svelte';

	const navLinks = [
		{ url: '/', label: 'home' },
		{ url: '/resources', label: 'resources' },
		{ url: '/blog', label: 'blog' }
	];
</script>

<ModeWatcher />

<Sidebar.Provider>
	<AppSidebar {navLinks} />
	<div
		class="flex min-h-screen w-full flex-col items-center bg-background px-8 py-8 sm:px-10 sm:py-10"
	>
		<div class="w-full md:w-5/6 xl:w-2/3">
			<nav class="grid grid-cols-3 items-center md:hidden">
				<Sidebar.Trigger />
				<a
					href="/"
					class="justify-self-center text-base font-medium text-foreground hover:text-primary"
				>
					phoXiv
				</a>
				<div></div>
			</nav>
			<nav class="hidden flex-row flex-wrap items-center justify-between gap-2 md:flex">
				<NavigationMenu.Root>
					<NavigationMenu.List class="gap-2 sm:gap-3">
						{#each navLinks as navLink (navLink.url)}
							<NavLink url={navLink.url} label={navLink.label} />
						{/each}
					</NavigationMenu.List>
				</NavigationMenu.Root>
				<NavButtons />
			</nav>

			<Separator class="my-3" />
			<main>
				{@render children?.()}
			</main>
		</div>
	</div>
</Sidebar.Provider>
