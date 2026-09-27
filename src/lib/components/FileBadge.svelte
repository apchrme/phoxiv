<script lang="ts">
	import Badge from '$lib/components/ui/badge/badge.svelte';
	import { ExternalLink } from '@lucide/svelte';

	/**
	 * A link to an uploaded file or external resource. `href` is always absolute,
	 * so it skips `resolve()` and the lint rule is disabled here.
	 */
	let {
		href,
		label,
		external = false,
		// Passing `class` replaces this default rather than merging with it.
		class: className = 'px-2.5 py-2.5 text-sm hover:border-primary/40 dark:hover:border-primary/30',
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
