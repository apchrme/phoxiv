<script lang="ts">
	import type { PageData } from './$types';
	import SvelteSeo from 'svelte-seo';
	import { Calendar, User, Tag, ChevronLeft } from '@lucide/svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import Separator from '$lib/components/ui/separator/separator.svelte';

	let { data }: { data: PageData } = $props();

	const { content: PostContent, metadata } = data;

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString('en-GB', {
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		});
	}
</script>

<SvelteSeo
	title="{metadata.title} - phoXiv Blog"
	description={metadata.description}
/>

<article class="pb-10">
	<!-- Back link -->
	<a
		href="/blog"
		class="mt-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground no-underline transition-colors hover:text-primary"
	>
		<ChevronLeft class="size-4" />
		Back to blog
	</a>

	<!-- Post header -->
	<header class="py-3 md:py-5 flex flex-col gap-3">

		<h1 class="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
			{metadata.title}
		</h1>

		{#if metadata.description}
			<p class="mb-1 text-base leading-relaxed text-muted-foreground">
				{metadata.description}
			</p>
		{/if}

		<!-- Meta row -->
		<div class="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
			{#if metadata.date}
				<span class="flex items-center gap-1.5">
					<Calendar class="size-3.5 shrink-0" />
					<time datetime={metadata.date}>{formatDate(metadata.date)}</time>
				</span>
			{/if}
			{#if metadata.author}
				<span aria-hidden="true" class="text-border">·</span>
				<span class="flex items-center gap-1.5">
					<User class="size-3.5 shrink-0" />
					{metadata.author}
				</span>
			{/if}
			{#if metadata.tags && metadata.tags.length > 0}
				<span aria-hidden="true" class="text-border">·</span>
				<span class="flex flex-wrap items-center gap-1.5">
					<Tag class="size-3.5 shrink-0" />
					{#each metadata.tags as tag (tag)}
						<Badge variant="secondary" class="px-2 py-0.5 text-xs font-normal">{tag}</Badge>
					{/each}
				</span>
			{/if}
		</div>
	</header>

	<Separator class="mb-8" />

	<!-- Post content -->
	<div class="prose max-w-none">
		<PostContent />
	</div>
</article>
