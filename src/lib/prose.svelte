<!-- Default layout for mdsvex files using Tailwind typography -->

<script lang="ts">
	const {
		children,
		title,
		description,
		seoTitle = title + ' — phoXiv',
		seoDescription = description
	} = $props();
	import Title from '$lib/components/Title.svelte';
	import SvelteSeo from 'svelte-seo';
</script>

<SvelteSeo title={seoTitle} description={seoDescription} />

<Title {title} {description} />

<div class="prose max-w-none dark:prose-invert">
	{@render children?.()}
</div>
