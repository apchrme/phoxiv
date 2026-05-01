<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
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
	import { Toaster } from '$lib/components/ui/sonner/index.js';
	import { Search } from '@lucide/svelte';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import * as Kbd from '$lib/components/ui/kbd/index.js';

	const navLinks = [
		{ url: '/', label: 'home' },
		{ url: '/olympiads', label: 'olympiads' },
		{ url: '/resources', label: 'resources' },
		{ url: '/blog', label: 'blog' },
		{ url: '/contribute', label: 'contribute' }
	];

	let searchOpen = $state(false);

	// Eagerly load all post metadata at build time so we can find the latest post.
	const postModules = import.meta.glob('/src/lib/posts/*.svx', { eager: true });

	onMount(() => {
		const posts = Object.entries(postModules)
			.map(([path, mod]) => {
				const slug = path.split('/').pop()?.replace('.svx', '') ?? '';
				const { metadata } = mod as { metadata: Record<string, unknown> };
				return {
					slug,
					title: String(metadata.title ?? 'Untitled'),
					date: String(metadata.date ?? '')
				};
			})
			.filter((p) => p.date)
			.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

		const latestPost = posts[0];
		if (!latestPost) return;

		const STORAGE_KEY = 'blog:last-seen-post';
		const lastSeen = localStorage.getItem(STORAGE_KEY);

		if (lastSeen !== latestPost.slug) {
			localStorage.setItem(STORAGE_KEY, latestPost.slug);
			// Short delay so the page finishes rendering before the toast appears.
			setTimeout(() => {
				toast('New blog post!', {
					description: latestPost.title,
					action: {
						label: 'Read',
						onClick: () => goto(resolve(`/blog/${latestPost.slug}`))
					},
					duration: 8000
				});
			}, 1200);
		}
	});
</script>

<svelte:head>
	<link rel="icon" href="/logo.svg?v=3" />
</svelte:head>

<ModeWatcher />
<GlobalSearch bind:open={searchOpen} />
<Toaster richColors closeButton position="top-center" />

<Sidebar.Provider>
	<AppSidebar {navLinks} />
	<div
		class="flex min-h-screen w-full flex-col items-center bg-background px-8 py-3 sm:px-10 sm:py-6"
	>
		<div class="w-full lg:w-5/6 xl:w-2/3">
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
						<span class="hidden lg:block">search…</span>
						<Kbd.Root class="hidden lg:inline-flex">⌘</Kbd.Root>
						<Kbd.Root class="hidden lg:inline-flex">K</Kbd.Root>
					</button>
					<NavButtons />
				</div>
			</nav>

			<Separator class="mt-3" />
			<main>
				{@render children?.()}
			</main>
		</div>
	</div>
</Sidebar.Provider>

<ScrollToTop />
