<script lang="ts">
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import NavButtons from './NavButtons.svelte';
	import { page } from '$app/state';
	import HouseIcon from '@lucide/svelte/icons/house';
	import TrophyIcon from '@lucide/svelte/icons/trophy';
	import LibraryIcon from '@lucide/svelte/icons/library';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import logo from '$lib/assets/branding/logo.svg';

	// navLinks is passed as a prop from +layout.svelte, which gets it from the same array defined there.
	const { navLinks } = $props();

	const sidebar = Sidebar.useSidebar();

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const iconMap: Record<string, any> = {
		'/': HouseIcon,
		'/olympiads': TrophyIcon,
		'/resources': LibraryIcon,
		'/blog': FileTextIcon
	};

	function isActive(url: string): boolean {
		if (url === '/') return page.url.pathname === '/';
		return page.url.pathname === url || page.url.pathname.startsWith(url + '/');
	}
</script>

<div class="md:hidden">
	<Sidebar.Root>
		<!-- Branded header -->
		<Sidebar.Header>
			<div class="flex items-center gap-3 px-2 py-1">
				<img src={logo} alt="" class="h-8 w-8 opacity-75" aria-hidden="true" />
				<div class="flex flex-col leading-tight">
					<span class="font-bold text-sidebar-foreground">phoXiv</span>
					<span class="font-mono text-[0.65rem] text-sidebar-foreground/50 tracking-[0.02em]"
						>/ foʊkaɪv /</span
					>
				</div>
			</div>
		</Sidebar.Header>

		<Sidebar.Separator />

		<Sidebar.Content>
			<Sidebar.Group>
				<Sidebar.GroupContent>
					<Sidebar.Menu>
						{#each navLinks as navLink (navLink.url)}
							{@const Icon = iconMap[navLink.url]}
							<Sidebar.MenuItem>
								<Sidebar.MenuButton isActive={isActive(navLink.url)} size="lg">
									{#snippet child({ props })}
										<a href={navLink.url} {...props} onclick={() => sidebar.toggle()}>
											{#if Icon}
												<Icon />
											{/if}
											<span>{navLink.label}</span>
										</a>
									{/snippet}
								</Sidebar.MenuButton>
							</Sidebar.MenuItem>
						{/each}
					</Sidebar.Menu>
				</Sidebar.GroupContent>
			</Sidebar.Group>
		</Sidebar.Content>

		<Sidebar.Footer class="gap-0 p-0">
			<Sidebar.Separator />
			<div class="flex items-center justify-center py-4">
				<NavButtons />
			</div>
		</Sidebar.Footer>
	</Sidebar.Root>
</div>