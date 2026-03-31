<script lang="ts">
	import { page } from '$app/state';
	const { url, label = url.substring(1) } = $props();
	import * as NavigationMenu from '$lib/components/ui/navigation-menu/index.js';
	import { cn } from './utils';
</script>

<NavigationMenu.Item>
	<NavigationMenu.Link
		href={url}
		aria-current={page.url.pathname == url}
		class="rounded-2xl py-2 text-base text-foreground {cn(page.url.pathname == url && 'bg-muted')}"
		>{label}</NavigationMenu.Link
	>
</NavigationMenu.Item>
