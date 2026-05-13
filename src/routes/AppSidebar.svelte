<script lang="ts">
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import NavButtons from './NavButtons.svelte';
	import { page } from '$app/state';
	import HouseIcon from '@lucide/svelte/icons/house';
	import TrophyIcon from '@lucide/svelte/icons/trophy';
	import LibraryIcon from '@lucide/svelte/icons/library';
	import FileTextIcon from '@lucide/svelte/icons/file-text';
	import { HandHelping, User, LogOut } from '@lucide/svelte';
	import logo from '$lib/assets/branding/logo.svg';
	import { authClient } from '$lib/auth-client';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	const { navLinks, user } = $props<{
		navLinks: { url: string; label: string }[];
		user: { name: string; email: string; image?: string | null } | null;
	}>();

	const sidebar = Sidebar.useSidebar();

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const iconMap: Record<string, any> = {
		'/': HouseIcon,
		'/olympiads': TrophyIcon,
		'/resources': LibraryIcon,
		'/blog': FileTextIcon,
		'/contribute': HandHelping
	};

	function isActive(url: string): boolean {
		if (url === '/') return page.url.pathname === '/';
		return page.url.pathname === url || page.url.pathname.startsWith(url + '/');
	}

	let signingOut = $state(false);

	async function signOut() {
		signingOut = true;
		try {
			await authClient.signOut();
			goto(resolve('/'));
			sidebar.setOpenMobile(false);
		} finally {
			signingOut = false;
		}
	}
</script>

<div class="md:hidden">
	<Sidebar.Root>
		<!-- Header: user profile when logged in, phoXiv branding when logged out -->
		<Sidebar.Header>
			{#if user}
				<!-- Logged-in: profile info -->
				<a
					href={resolve('/profile')}
					class="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-sidebar-accent"
					onclick={() => sidebar.setOpenMobile(false)}
				>
					{#if user.image}
						<img
							src={user.image}
							alt={user.name}
							class="size-9 shrink-0 rounded-full ring-2 ring-sidebar-border"
						/>
					{:else}
						<div
							class="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 ring-2 ring-sidebar-border"
						>
							<User class="size-4 text-primary" />
						</div>
					{/if}
					<div class="flex min-w-0 flex-1 flex-col leading-tight">
						<span class="truncate text-sm font-semibold text-sidebar-foreground">{user.name}</span>
						<span class="truncate text-xs text-sidebar-foreground/50">{user.email}</span>
					</div>
				</a>
			{:else}
				<!-- Logged-out: phoXiv branding -->
				<div class="flex items-center gap-3 px-2 py-1">
					<img src={logo} alt="" class="h-8 w-8 opacity-75" aria-hidden="true" />
					<div class="flex flex-col leading-tight">
						<span class="font-bold text-sidebar-foreground">phoXiv</span>
						<span class="font-mono text-[0.65rem] tracking-[0.02em] text-sidebar-foreground/50"
							>/ foʊkaɪv /</span
						>
					</div>
				</div>
			{/if}
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
			<div class="flex items-center justify-between px-3 py-3">
				<NavButtons />
				{#if user}
					<button
						onclick={signOut}
						disabled={signingOut}
						class="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-destructive disabled:opacity-50"
						aria-label="Sign out"
					>
						<LogOut class="size-3.5" />
						{signingOut ? '…' : 'Sign out'}
					</button>
				{/if}
			</div>
		</Sidebar.Footer>
	</Sidebar.Root>
</div>