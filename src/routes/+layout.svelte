<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	let { children, data } = $props();

	import NavLink from './NavLink.svelte';
	import { ModeWatcher } from 'mode-watcher';
	import * as NavigationMenu from '$lib/components/ui/navigation-menu/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import AppSidebar from './AppSidebar.svelte';
	import NavButtons from './NavButtons.svelte';
	import ScrollToTop from '$lib/components/ScrollToTop.svelte';
	import GlobalSearch from '$lib/components/GlobalSearch.svelte';
	import { Toaster } from '$lib/components/ui/sonner/index.js';
	import { Search } from '@lucide/svelte';
	import LogIn from '$lib/components/buttons/LogIn.svelte';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import brand from '$lib/assets/branding/brand.svg';
	import * as Kbd from '$lib/components/ui/kbd/index.js';

	const navLinks = [
		{ url: '/', label: 'home' },
		{ url: '/olympiads', label: 'olympiads' },
		{ url: '/resources', label: 'resources' },
		{ url: '/blog', label: 'blog' },
		{ url: '/contribute', label: 'contribute' }
	];

	let searchOpen = $state(false);

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

<!-- Fixed background orb decorations — visible through the glass panels -->
<div class="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
	<div
		class="absolute -top-40 -left-40 h-[32rem] w-[32rem] animate-pulse rounded-full bg-violet-400/20 blur-[80px] dark:bg-violet-500/12"
		style="animation-duration: 8s;"
	></div>
	<div
		class="absolute top-1/3 -right-48 h-[28rem] w-[28rem] animate-pulse rounded-full bg-sky-400/18 blur-[80px] dark:bg-sky-500/12"
		style="animation-duration: 11s; animation-delay: -3s;"
	></div>
	<div
		class="absolute -bottom-32 left-1/4 h-[26rem] w-[26rem] animate-pulse rounded-full bg-pink-400/15 blur-[80px] dark:bg-purple-500/10"
		style="animation-duration: 9s; animation-delay: -5s;"
	></div>
	<div
		class="absolute top-2/3 left-1/2 h-[22rem] w-[22rem] animate-pulse rounded-full bg-indigo-300/15 blur-[100px] dark:bg-indigo-600/10"
		style="animation-duration: 14s; animation-delay: -7s;"
	></div>
</div>

<Sidebar.Provider>
	<AppSidebar {navLinks} user={data.user} />
	<!-- Main wrapper — transparent so html gradient shows through -->
	<div class="flex min-h-screen w-full flex-col items-center px-4 pb-3 pt-4">
		<div class="w-full lg:w-5/6 xl:w-2/3">
			<!-- Mobile nav — glass pill -->
			<nav
				class="flex justify-between items-center md:hidden sticky p-1.5 top-2 rounded-full z-40
				       bg-white/50 dark:bg-background/90
				       border border-white/60 dark:border-white/10
				       shadow-lg shadow-black/5 dark:shadow-black/30"
			>
				<Sidebar.Trigger />
				<a href={resolve("/")}>
					<img src={brand} alt="phoXiv" class="h-6 opacity-80"/>	
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
				class="hidden flex-row flex-wrap items-center justify-between gap-2 md:flex sticky p-1.5 top-2 z-40
				       rounded-full
				       bg-white/45 dark:bg-white/5
				       backdrop-blur-none md:backdrop-blur-xl
				       border border-white/65 dark:border-white/10
				       shadow-lg shadow-violet-500/5 dark:shadow-black/40
				       ring-1 ring-inset ring-white/50 dark:ring-white/5"
			>
				<NavigationMenu.Root>
					<NavigationMenu.List class="gap-1 sm:gap-2">
						{#each navLinks as navLink (navLink.url)}
							<NavLink url={navLink.url} label={navLink.label} />
						{/each}
					</NavigationMenu.List>
				</NavigationMenu.Root>
				<div class="flex items-center gap-2">
					<button
						onclick={() => (searchOpen = true)}
						class="{buttonVariants({
							variant: 'ghost'
						})} items-center gap-2 text-sm text-muted-foreground
						       bg-white/30 dark:bg-white/5 border border-white/50 dark:border-white/10
						       hover:bg-white/50 dark:hover:bg-white/10"
						aria-label="Search problems"
					>
						<Search class="size-4" />
						<span class="hidden lg:block">search…</span>
						<!-- <Kbd.Root class="hidden lg:inline-flex">⌘</Kbd.Root> -->
						<!-- <Kbd.Root class="hidden lg:inline-flex">K</Kbd.Root> -->
					</button>
					<NavButtons />
					<LogIn user={data.user} />
				</div>
			</nav>

			<main>
				{@render children?.()}
			</main>
		</div>
	</div>
</Sidebar.Provider>

<ScrollToTop />