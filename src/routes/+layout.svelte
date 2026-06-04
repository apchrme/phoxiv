<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import { page } from '$app/state';
	let { children, data } = $props();

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
	import { cn } from '$lib/utils.js';
	import DarkModeButton from '$lib/components/buttons/DarkModeButton.svelte';

	const navLinks = [
		{ url: '/', label: 'home' },
		{ url: '/olympiads', label: 'olympiads' },
		{ url: '/resources', label: 'resources' }
	];

	let moreNavLinks = $state([
		{ url: '/blog', label: 'blog' },
		{ url: '/contribute', label: 'contribute' },
		{ url: '/privacy', label: 'privacy policy' }
	]);

	onMount(() => {
		if (data?.user?.role == 'admin') {
			moreNavLinks.push({ url: '/admin', label: 'admin' });
		}
	});

	let searchOpen = $state(false);

	// Disabled as there hasn't been any blog posts in a while
	/*
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
	*/
</script>

<svelte:head>
	<link rel="icon" href="/logo.svg?v=4" />
</svelte:head>

<ModeWatcher />
<GlobalSearch bind:open={searchOpen} />
<Toaster richColors closeButton position="top-center" />

<Sidebar.Provider>
	<AppSidebar navLinks={navLinks.concat(moreNavLinks)} user={data.user} />
	<!-- Main wrapper — transparent so html gradient shows through -->
	<div class="flex min-h-screen w-full flex-col items-center px-4 pt-4 pb-3 bg-background">
		<div class="w-full lg:w-5/6 xl:w-2/3">
			<!-- Mobile nav — glass pill -->
			<nav
				class="sticky top-2 z-40 md:hidden flex-row flex-wrap items-center justify-between gap-2 rounded-full border
				       border-white/65
				       bg-white/45 p-1.5
				       shadow-lg
				       ring-1 shadow-violet-500/5 ring-white/50
				       backdrop-blur-xl ring-inset flex
				       dark:border-white/10 dark:bg-white/5 dark:shadow-black/40 dark:ring-white/5"
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
				class="sticky top-2 z-40 hidden flex-row flex-wrap items-center justify-between gap-2 rounded-full border
				       border-white/65
				       bg-white/45 p-1.5
				       shadow-lg
				       ring-1 shadow-violet-500/5 ring-white/50
				       backdrop-blur-xl ring-inset md:flex
				       dark:border-white/10 dark:bg-white/5 dark:shadow-black/40 dark:ring-white/5"
			>
				<NavigationMenu.Root viewport={false}>
					<NavigationMenu.List class="gap-1 sm:gap-2">
						{#each navLinks as navLink (navLink.url)}
							<NavigationMenu.Item>
								<NavigationMenu.Link
									href={navLink.url}
									aria-current={page.url.pathname == navLink.url}
									data-active={page.url.pathname == navLink.url}
									class="rounded-full py-2 text-base font-medium text-foreground hover:text-primary "
									>{navLink.label}</NavigationMenu.Link
								>
							</NavigationMenu.Item>
						{/each}
						<NavigationMenu.Item openOnHover={false}>
							<NavigationMenu.Trigger>
								<p>more</p>
							</NavigationMenu.Trigger>
							<NavigationMenu.Content>
								<ul>
									{#each moreNavLinks as navLink (navLink.url)}
										<li>
											<NavigationMenu.Link
												href={navLink.url}
												aria-current={page.url.pathname == navLink.url}
												data-active={page.url.pathname == navLink.url}
												class="rounded-full py-2 text-base font-medium text-foreground hover:text-primary "
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
