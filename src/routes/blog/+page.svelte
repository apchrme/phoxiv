<script lang="ts">
	import type { PageData } from './$types';
	import SvelteSeo from 'svelte-seo';
	import * as Badge from '$lib/components/ui/badge/index.js';
	import { Calendar, Tag, User, ArrowRight} from '@lucide/svelte';
	import Title from '$lib/components/Title.svelte';

	let { data }: { data: PageData } = $props();

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString('en-GB', {
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		});
	}
</script>

<SvelteSeo
	title="Blog — phoXiv"
	description="Updates, articles, and notes from the phoXiv team about physics olympiads and the archive."
/>

<div class="blog-page">
	<!-- Header -->
	<Title title="Blog" description="Just a collection of anything going on in my brain"/>

	<!-- Post list -->
	{#if data.posts.length === 0}
		<div class="flex flex-col items-center justify-center gap-3 py-20 text-center">
			<p class="m-0 text-muted-foreground">No posts yet — check back soon.</p>
		</div>
	{:else}
		<ol class="m-0 flex flex-col gap-px p-0" style="list-style:none">
			{#each data.posts as post, i (post.slug)}
				<li class="group relative">
					<!-- Divider above each item except first -->
					{#if i > 0}
						<div class="h-px w-full bg-border"></div>
					{/if}

					<a
						href="/blog/{post.slug}"
						class="blog-card flex flex-col gap-3 rounded-lg px-1 py-5 no-underline transition-colors hover:bg-muted/40 sm:flex-row sm:items-start sm:gap-6"
					>
						<!-- Date column -->
						<div class="flex shrink-0 items-center gap-1.5 sm:w-36 sm:pt-0.5">
							<Calendar class="size-3.5 shrink-0 text-muted-foreground" />
							<time
								datetime={post.date}
								class="font-mono text-xs text-muted-foreground"
							>
								{formatDate(post.date)}
							</time>
						</div>

						<!-- Content column -->
						<div class="flex min-w-0 flex-1 flex-col gap-2">
							<div class="flex items-center gap-2">
								<h2
									class="m-0 text-base font-semibold leading-snug text-foreground transition-colors group-hover:text-primary sm:text-lg"
								>
									{post.title}
								</h2>
								<ArrowRight
									class="size-4 shrink-0 translate-x-0 text-muted-foreground opacity-0 transition-all group-hover:translate-x-1 group-hover:text-primary group-hover:opacity-100"
								/>
							</div>

							{#if post.description}
								<p class="m-0 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
									{post.description}
								</p>
							{/if}

							<div class="flex flex-wrap items-center gap-2">
								{#if post.author}
									<span class="flex items-center gap-1 text-xs text-muted-foreground">
										<User class="size-3" />
										{post.author}
									</span>
								{/if}
								{#if post.tags && post.tags.length > 0}
									<span class="flex items-center gap-1 text-muted-foreground" aria-hidden="true">·</span>
									{#each post.tags as tag (tag)}
										<Badge.Root variant="secondary" class="gap-1 px-2 py-0.5 text-xs font-normal">
											<Tag class="size-2.5" />
											{tag}
										</Badge.Root>
									{/each}
								{/if}
							</div>
						</div>
					</a>
				</li>
			{/each}
		</ol>
	{/if}
</div>

<style>
	.blog-card {
		text-decoration: none;
	}
</style>
