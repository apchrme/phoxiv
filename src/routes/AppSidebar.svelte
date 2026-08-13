<script lang="ts">
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import { page } from '$app/state';
	import { LogIn } from '@lucide/svelte';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import { resolve } from '$app/paths';
	import DarkModeButton from '$lib/components/buttons/DarkModeButton.svelte';
	import type { NavLink } from '$lib/nav';

	const { navLinks, user } = $props<{
		navLinks: NavLink[];
		user: { name: string; email: string; image?: string | null; role?: string | null } | null;
	}>();

	const sidebar = Sidebar.useSidebar();

	function isActive(href: string): boolean {
		if (href === resolve('/')) return page.url.pathname === href;
		return page.url.pathname === href || page.url.pathname.startsWith(href + '/');
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
					<UserAvatar {user} class="size-9 ring-2 ring-sidebar-border" />
					<div class="flex min-w-0 flex-1 flex-col leading-tight">
						<span class="truncate text-sm font-semibold text-sidebar-foreground">{user.name}</span>
						<span class="truncate text-xs text-sidebar-foreground/50">{user.email}</span>
					</div>
				</a>
			{:else}
				<!-- Logged-out: Log in button -->
				<Sidebar.Menu>
					<Sidebar.MenuItem>
						<Sidebar.MenuButton>
							{#snippet child({ props })}
								<a href={resolve('/login')} {...props} onclick={() => sidebar.toggle()}>
									<LogIn />
									<span>Log in</span>
								</a>
							{/snippet}
						</Sidebar.MenuButton>
					</Sidebar.MenuItem>
				</Sidebar.Menu>
			{/if}
		</Sidebar.Header>

		<Sidebar.Separator />

		<Sidebar.Content>
			<Sidebar.Group>
				<Sidebar.GroupContent>
					<Sidebar.Menu>
						{#each navLinks as navLink (navLink.href)}
							{@const Icon = navLink.icon}
							<Sidebar.MenuItem>
								<Sidebar.MenuButton isActive={isActive(navLink.href)} size="lg">
									{#snippet child({ props })}
										<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- already resolved in $lib/nav.ts -->
										<a href={navLink.href} {...props} onclick={() => sidebar.toggle()}>
											<Icon />
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
			<div class="flex items-center justify-center px-3 py-3">
				<DarkModeButton />
			</div>
		</Sidebar.Footer>
	</Sidebar.Root>
</div>
