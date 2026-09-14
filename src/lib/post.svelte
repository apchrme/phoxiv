<!--
	Layout for blog posts — `$lib/posts/*.svx`, selected by the `posts` key in
	`svelte.config.js`'s mdsvex layout map.

	It renders the prose wrapper and nothing else, on purpose. mdsvex hands a
	post's front matter to its layout as props, so while posts shared
	`prose.svelte` with the standalone `.svx` pages every post printed its `title`
	and `description` twice — once from that layout's `PageHeader`, once from the
	header `(reg)/blog/[slug]/+page.svelte` builds — and emitted two competing
	`SvelteSeo` blocks, hence two `<title>` tags. The blog route owns a post's
	header and SEO because only it knows the date, author and tags; this layout
	owns only the typography.
-->

<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children?: Snippet } = $props();
</script>

<div class="prose max-w-none dark:prose-invert">
	{@render children?.()}
</div>
