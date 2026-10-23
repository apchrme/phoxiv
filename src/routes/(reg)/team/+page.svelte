<script lang="ts">
	import { onMount } from 'svelte';
	import SvelteSeo from 'svelte-seo';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import EmptyState from '#lib/components/EmptyState.svelte';
	import UserAvatar from '#lib/components/UserAvatar.svelte';
	import Skeleton from '#lib/components/ui/skeleton/skeleton.svelte';
	import { Badge } from '#lib/components/ui/badge/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import { TriangleAlert, Users } from '@lucide/svelte';
	import { roleLabel, roleVariant } from '#lib/activity.js';
	import { plural } from '#lib/utils/plural.js';
	import { Resource } from '#lib/resource.svelte.js';
	import type { TeamMember } from '#lib/types.js';

	/**
	 * Every admin and contributor, most uploads first. Fetched from the
	 * shared-cached `/api/team` instead of a page load, to save a D1 read per
	 * visit, like the olympiads index.
	 */
	const source = new Resource<TeamMember[]>('/api/team');
	onMount(() => void source.loadOnce());
</script>

<SvelteSeo
	title="Team — phoXiv"
	description="The people who build and maintain the phoXiv archive."
/>

<PageHeader
	title="Team"
	description="The admins and contributors who build the archive, by number of files uploaded."
/>

<section class="mb-6">
	{#if source.loading}
		<div class="flex flex-col gap-2">
			{#each { length: 5 }, i (i)}
				<Skeleton class="h-16 w-full" />
			{/each}
		</div>
	{:else if source.failed}
		<EmptyState
			variant="error"
			icon={TriangleAlert}
			message="Couldn't load the team"
			hint="Something went wrong fetching the list. Reloading usually fixes it."
		>
			{#snippet action()}
				<Button variant="outline" size="sm" onclick={() => location.reload()}>Reload</Button>
			{/snippet}
		</EmptyState>
	{:else if source.value && source.value.length > 0}
		<ol class="m-0 flex list-none flex-col gap-2 p-0">
			{#each source.value as member, i (i)}
				<li
					class="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-card-foreground"
				>
					<span class="w-6 shrink-0 text-right font-mono text-sm text-muted-foreground">
						{i + 1}
					</span>
					<UserAvatar user={member} class="size-9 ring-2 ring-border" iconClass="size-4" />
					<div class="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2">
						<span class="truncate font-medium">{member.name}</span>
						<Badge variant={roleVariant(member.role)} class="w-fit">
							{roleLabel(member.role)}
						</Badge>
					</div>
					<span class="shrink-0 text-sm text-muted-foreground tabular-nums">
						{plural(member.uploads, 'file')}
					</span>
				</li>
			{/each}
		</ol>
	{:else}
		<EmptyState icon={Users} message="No one here yet" />
	{/if}
</section>
