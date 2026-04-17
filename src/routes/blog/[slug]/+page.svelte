<script lang="ts">
	import type { PageData } from './$types';
	import SvelteSeo from 'svelte-seo';
	import { Calendar, User, Tag, ChevronLeft } from '@lucide/svelte';
	import * as Badge from '$lib/components/ui/badge/index.js';
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
	title="{metadata.title} — phoXiv Blog"
	description={metadata.description}
/>

<article class="blog-post py-4">
	<!-- Back link -->
	<a
		href="/blog"
		class="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground no-underline transition-colors hover:text-primary"
	>
		<ChevronLeft class="size-4" />
		Back to blog
	</a>

	<!-- Post header -->
	<header class="mb-8 flex flex-col gap-4">
		<h1 class="text-left! m-0 text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl">
			{metadata.title}
		</h1>

		{#if metadata.description}
			<p class="m-0 text-base leading-relaxed text-muted-foreground">
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
						<Badge.Root variant="secondary" class="px-2 py-0.5 text-xs font-normal">{tag}</Badge.Root>
					{/each}
				</span>
			{/if}
		</div>
	</header>

	<Separator class="mb-8" />

	<!-- Post content -->
	<div class="post-content prose prose-phoxiv max-w-none">
		<PostContent />
	</div>
</article>

<style>
	/* Prose overrides to match Catppuccin theme */
	:global(.post-content.prose) {
		--tw-prose-body: var(--foreground);
		--tw-prose-headings: var(--foreground);
		--tw-prose-lead: var(--muted-foreground);
		--tw-prose-links: var(--primary);
		--tw-prose-bold: var(--foreground);
		--tw-prose-counters: var(--muted-foreground);
		--tw-prose-bullets: var(--muted-foreground);
		--tw-prose-hr: var(--border);
		--tw-prose-quotes: var(--foreground);
		--tw-prose-quote-borders: var(--primary);
		--tw-prose-captions: var(--muted-foreground);
		--tw-prose-code: var(--foreground);
		--tw-prose-pre-code: var(--foreground);
		--tw-prose-pre-bg: var(--card);
		--tw-prose-th-borders: var(--border);
		--tw-prose-td-borders: var(--border);

		font-family: var(--font-sans);
		font-size: 1rem;
		line-height: 1.75;
	}

	:global(.post-content.prose code) {
		font-family: var(--font-mono);
		font-size: 0.875em;
		background-color: var(--muted);
		padding: 0.125em 0.375em;
		border-radius: 0.25rem;
		font-weight: 400;
	}

	:global(.post-content.prose code::before),
	:global(.post-content.prose code::after) {
		content: none;
	}

	:global(.post-content.prose pre) {
		background-color: var(--card);
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}

	:global(.post-content.prose pre code) {
		background-color: transparent;
		padding: 0;
	}

	:global(.post-content.prose blockquote) {
		border-left-color: var(--primary);
		color: var(--muted-foreground);
		font-style: normal;
	}

	:global(.post-content.prose h1) {
		font-weight: 700;
	}

	:global(.post-content.prose a) {
		color: var(--primary);
		text-decoration-thickness: 1px;
		text-underline-offset: 3px;
		transition: color 150ms;
	}

	:global(.post-content.prose a:hover) {
		color: color-mix(in oklab, var(--primary) 60%, transparent);
	}

	:global(.post-content.prose hr) {
		border-color: var(--border);
	}

	:global(.post-content.prose table) {
		font-size: 0.9em;
	}

	:global(.post-content.prose thead) {
		border-bottom-color: var(--border);
	}

	:global(.post-content.prose thead th) {
		color: var(--foreground);
		font-weight: 600;
	}
</style>
