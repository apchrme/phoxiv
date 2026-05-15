<script lang="ts">
	import { page } from '$app/state';
	const { url, label = url.substring(1) } = $props();
	import * as NavigationMenu from '$lib/components/ui/navigation-menu/index.js';
	import { cn } from '$lib/utils';
</script>

<NavigationMenu.Item>
	<NavigationMenu.Link
		href={url}
		aria-current={page.url.pathname == url}
		data-active={page.url.pathname == url}
		class="rounded-full py-2 text-base font-medium text-foreground hover:text-primary ">{label}</NavigationMenu.Link
	>
</NavigationMenu.Item>
