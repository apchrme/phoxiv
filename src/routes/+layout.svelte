<script lang="ts">
	import '../app.css';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { LayoutProps } from './$types';
	let { children, data }: LayoutProps = $props();

	import { ModeWatcher } from 'mode-watcher';
	import * as NavigationMenu from '$lib/components/ui/navigation-menu/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import AppSidebar from './AppSidebar.svelte';
	import ScrollToTop from '$lib/components/ScrollToTop.svelte';
	import GlobalSearch from '$lib/components/GlobalSearch.svelte';
	import { Toaster } from '$lib/components/ui/sonner/index.js';
	import { Search } from '@lucide/svelte';
	import LogIn from '$lib/components/buttons/LogIn.svelte';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import brand from '$lib/assets/branding/brand.svg';
	import * as Kbd from '$lib/components/ui/kbd/index.js';
	import DarkModeButton from '$lib/components/buttons/DarkModeButton.svelte';
	import { PRIMARY_NAV, secondaryNavFor } from '$lib/nav';

	const secondaryNav = $derived(secondaryNavFor(data.user));

	let searchOpen = $state(false);
</script>

<svelte:head>
	<link rel="icon" href="/favicon.ico" />
</svelte:head>

<ModeWatcher />
<GlobalSearch bind:open={searchOpen} />
<Toaster richColors closeButton position="top-center" />

<Sidebar.Provider>
	<AppSidebar navLinks={[...PRIMARY_NAV, ...secondaryNav]} user={data.user} />
	<!-- Main wrapper — transparent so html gradient shows through -->
	<div class="flex min-h-screen w-full flex-col items-center px-4 pt-6 pb-3 bg-background">
		<div class="w-full lg:w-5/6 xl:w-2/3">
			<!-- Mobile nav — glass pill -->
			<nav
				class="glass sticky top-3 z-40 flex flex-row flex-wrap items-center justify-between gap-2 rounded-full p-1.5 md:hidden"
			>
				<Sidebar.Trigger />
				<a href={resolve('/')}>
					<img src={brand} alt="phoXiv" class="h-6 brightness-85 dark:brightness-100" />
				</a>
				<button
					onclick={() => (searchOpen = true)}
					class="{buttonVariants({ variant: 'ghost', size: 'icon' })} justify-self-end"
					aria-label="Search problems"
				>
					<Search class="size-4" />
				</button>
			</nav>

			<!-- Desktop nav — glass pill -->
			<nav
				class="glass sticky top-3 z-40 hidden flex-row flex-wrap items-center justify-between gap-2 rounded-full p-1.5 md:flex"
			>
				<NavigationMenu.Root viewport={false}>
					<NavigationMenu.List class="gap-1 sm:gap-2">
						{#each PRIMARY_NAV as navLink (navLink.href)}
							<NavigationMenu.Item>
								<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- already resolved in $lib/nav.ts -->
								<NavigationMenu.Link
									href={navLink.href}
									aria-current={page.url.pathname == navLink.href}
									data-active={page.url.pathname == navLink.href}
									class="rounded-full py-2 text-base font-medium text-foreground hover:text-primary transition-colors duration-250"
									>{navLink.label}</NavigationMenu.Link
								>
							</NavigationMenu.Item>
						{/each}
						<NavigationMenu.Item openOnHover={false}>
							<NavigationMenu.Trigger class="transition-colors duration-250">
								<p>more</p>
							</NavigationMenu.Trigger>
							<NavigationMenu.Content>
								<ul class="flex flex-col gap-1">
									{#each secondaryNav as navLink (navLink.href)}
										<li>
											<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- already resolved in $lib/nav.ts -->
											<NavigationMenu.Link
												href={navLink.href}
												aria-current={page.url.pathname == navLink.href}
												data-active={page.url.pathname == navLink.href}
												class="rounded-full py-2 text-base font-medium text-foreground hover:text-primary transition-colors duration-250"
												>{navLink.label}</NavigationMenu.Link
											>
										</li>
									{/each}
								</ul>
							</NavigationMenu.Content>
						</NavigationMenu.Item>
					</NavigationMenu.List>
				</NavigationMenu.Root>
				<div class="flex items-center gap-2">
					<button
						onclick={() => (searchOpen = true)}
						class="{buttonVariants({
							variant: 'ghost'
						})} items-center gap-2 border border-white/50
						       bg-white/30 text-sm text-muted-foreground hover:bg-white/50 dark:border-white/10
						       dark:bg-white/5 dark:hover:bg-white/10"
						aria-label="Search problems"
					>
						<Search class="size-4" />
						<span class="block">search…</span>
						<Kbd.Root class="inline-flex">⌘</Kbd.Root>
						<Kbd.Root class="inline-flex">K</Kbd.Root>
					</button>
					<DarkModeButton />
					<LogIn user={data?.user} />
				</div>
			</nav>

			<main>
				{@render children?.()}
			</main>
		</div>
	</div>
</Sidebar.Provider>

<ScrollToTop />
