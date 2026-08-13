<script lang="ts">
	import Badge from '$lib/components/ui/badge/badge.svelte';
	import { ExternalLink } from '@lucide/svelte';

	/**
	 * A link to one uploaded file or external resource.
	 *
	 * `href` is always an absolute URL — either a CDN object or a contributor's
	 * extra link — so it never goes through `resolve()`. That is also why the
	 * lint rule is suppressed here rather than at each call site.
	 */
	let {
		href,
		label,
		external = false,
		class: className = 'px-2.5 py-2.5 text-sm',
		onclick
	}: {
		href: string;
		label: string;
		/** Show an outbound-link icon, for links that leave the archive. */
		external?: boolean;
		class?: string;
		onclick?: (event: MouseEvent) => void;
	} = $props();
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -- absolute CDN or external url -->
<Badge variant="outline" {href} target="_blank" class={className} {onclick}>
	{label}
	{#if external}
		<ExternalLink class="size-3" />
	{/if}
</Badge>
<!-- eslint-enable svelte/no-navigation-without-resolve -->
