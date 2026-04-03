<script lang="ts">
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import NavButtons from './NavButtons.svelte';
	const { navLinks } = $props();

	const sidebar = Sidebar.useSidebar();
</script>

<div class="md:hidden">
	<Sidebar.Root>
		<Sidebar.Content>
			<Sidebar.Group>
				<Sidebar.GroupLabel>phoXiv</Sidebar.GroupLabel>
				<Sidebar.GroupContent>
					<Sidebar.Menu>
						{#each navLinks as navLink (navLink.url)}
							<Sidebar.MenuItem>
								<Sidebar.MenuButton>
									{#snippet child({ props })}
										<a href={navLink.url} {...props} onclick={() => sidebar.toggle()}>
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
		<Sidebar.Footer class="items-center py-5">
			<NavButtons />
		</Sidebar.Footer>

	</Sidebar.Root>
</div>
