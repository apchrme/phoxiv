<!--
	mdsvex layout for blog posts (`$lib/posts/*.svx`). Typography only: the blog
	route renders the header and SEO. Don't add them here, or posts get a second
	title and two <title> tags.
-->

<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children?: Snippet } = $props();
</script>

<div class="prose max-w-none dark:prose-invert">
	{@render children?.()}
</div>
