<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import CheckIcon from '@lucide/svelte/icons/check';
	import EyeOffIcon from '@lucide/svelte/icons/eye-off';
	import ListIcon from '@lucide/svelte/icons/list';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import EmptyState from '#lib/components/EmptyState.svelte';
	import BadgeMedal from '#lib/components/BadgeMedal.svelte';
	import Meter from '#lib/components/Meter.svelte';
	import Skeleton from '#lib/components/ui/skeleton/skeleton.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import { Resource } from '#lib/resource.svelte.js';
	import { isDone } from '#lib/filters.js';
	import { formatDate } from '#lib/utils/date.js';
	import { plural } from '#lib/utils/plural.js';
	import type { BadgeProblem, BadgeProgressMap, PublicBadgeDetail } from '#lib/badges.js';
	import type { GlobalProgressMap } from '#lib/progress.js';
	import type { PageData } from './$types';

	/**
	 * One badge: what it takes, how many hold it, where the viewer stands, and,
	 * for a hand-picked badge, exactly which problems count.
	 *
	 * Fetched like `/badges`: the badge from the shared-cached `/api/badges/[id]`,
	 * and the viewer's standing from the uncached `/progress/badges`, which also
	 * carries a hidden badge's requirement (list included) once the viewer holds
	 * it. Problems are listed without topics, as everywhere else
	 * (docs/data-model.md).
	 */
	let { badge, signedIn }: { badge: PageData['badge']; signedIn: boolean } = $props();

	const detail = new Resource<PublicBadgeDetail>(() => `/api/badges/${badge.id}`);
	const mine = new Resource<BadgeProgressMap>('/progress/badges');
	/** Only to tick the problems the viewer has done, so fetched only for a list. */
	const progress = new Resource<GlobalProgressMap>('/progress');

	// Captured at mount, not tracked: a sign-in or sign-out reloads the page.
	onMount(() => {
		void detail.loadOnce();
		if (signedIn) void mine.loadOnce();
	});

	const standing = $derived(mine.value?.[badge.id]);
	const earned = $derived(!!standing?.earnedAt);
	// A hidden requirement comes only from the viewer's own standing, and only
	// once they hold the badge.
	const summary = $derived(detail.value?.summary ?? standing?.revealed?.summary ?? null);
	const requiredCount = $derived(
		detail.value?.requiredCount ?? standing?.revealed?.requiredCount ?? null
	);
	const problems = $derived(detail.value?.problems ?? standing?.revealed?.problems ?? null);
	// The count can be a day old, the viewer's standing never is, so don't show
	// "0 people" on a badge the viewer holds.
	const holders = $derived(Math.max(detail.value?.holders ?? 0, earned ? 1 : 0));

	$effect(() => {
		if (signedIn && problems) void progress.loadOnce();
	});

	/** The list split by olympiad, keeping the server's order. */
	const groups = $derived.by(() => {
		const out: { id: string; name: string; problems: BadgeProblem[] }[] = [];
		for (const p of problems ?? []) {
			const last = out.at(-1);
			if (last?.id === p.olympiadId) last.problems.push(p);
			else out.push({ id: p.olympiadId, name: p.olympiadName, problems: [p] });
		}
		return out;
	});

	const doneCount = $derived(
		progress.value
			? (problems ?? []).filter((p) => isDone(progress.value!, p.olympiadId, p.year, p.number))
					.length
			: null
	);
</script>

<PageHeader title={badge.name} description={badge.description || undefined}>
	{#snippet leading()}
		<!-- Muted only once we know the viewer hasn't earned it. -->
		<BadgeMedal icon={badge.icon} color={badge.color} size="lg" earned={!standing || earned} />
	{/snippet}
</PageHeader>

<div class="flex flex-col gap-6 pb-16">
	{#if detail.loading}
		<Skeleton class="h-24 w-full" />
	{:else if detail.failed}
		<EmptyState
			variant="error"
			icon={TriangleAlertIcon}
			message="Couldn't load this badge"
			hint="Something went wrong fetching it. Reloading usually fixes it."
		>
			{#snippet action()}
				<Button variant="outline" size="sm" onclick={() => location.reload()}>Reload</Button>
			{/snippet}
		</EmptyState>
	{:else}
		<section
			aria-label="Requirement"
			data-testid="badge-requirement"
			class="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 text-card-foreground"
		>
			<div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
				{#if summary !== null}
					<p class="m-0 font-medium">{summary}</p>
				{:else}
					<p class="m-0 flex items-center gap-1.5 text-muted-foreground italic">
						<EyeOffIcon class="size-4 shrink-0" /> Requirement hidden
					</p>
				{/if}
				<span class="shrink-0 text-sm text-muted-foreground tabular-nums">
					Earned by {plural(holders, 'person', 'people')}
				</span>
			</div>

			{#if standing}
				{#if earned}
					<p class="m-0 flex items-center gap-1 text-sm font-medium text-primary">
						<CheckIcon class="size-4" /> You earned this {formatDate(standing.earnedAt, 'short')}
					</p>
				{:else if standing.count !== null && requiredCount !== null}
					<!-- Both are null while the requirement is hidden: progress would give
					     it away. -->
					<div class="flex items-center gap-2">
						<Meter value={standing.count} max={requiredCount} label="{badge.name} progress" />
						<span class="shrink-0 text-xs text-muted-foreground tabular-nums">
							{Math.min(standing.count, requiredCount)}/{requiredCount}
						</span>
					</div>
				{/if}
			{/if}
		</section>

		{#if problems}
			<section aria-labelledby="badge-problems" class="flex flex-col gap-3">
				<div class="flex flex-wrap items-baseline justify-between gap-2">
					<h2 id="badge-problems" class="m-0 text-lg font-semibold">The selected problems</h2>
					<span class="text-sm text-muted-foreground tabular-nums">
						{#if doneCount !== null}
							{doneCount} of {plural(problems.length, 'problem')} done
						{:else}
							{plural(problems.length, 'problem')}
						{/if}
					</span>
				</div>

				{#if problems.length === 0}
					<EmptyState
						icon={ListIcon}
						message="No problems left in this list"
						hint="The problems it counted have been removed from the archive."
					/>
				{:else}
					{#each groups as group (group.id)}
						<div class="flex flex-col gap-1">
							<h3 class="m-0 text-sm font-semibold text-muted-foreground">{group.name}</h3>
							<ul
								aria-label="{group.name} problems"
								class="m-0 flex list-none flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-card p-0"
							>
								{#each group.problems as p (`${p.year}\u0000${p.number}`)}
									{@const done =
										progress.value !== null &&
										isDone(progress.value, p.olympiadId, p.year, p.number)}
									<li data-testid="badge-problem">
										<a
											href={resolve(`olympiads/${p.olympiadId}#${p.year}`)}
											class="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-muted/60"
										>
											<span class="w-24 shrink-0 text-muted-foreground tabular-nums">
												{p.year} · {p.number}
											</span>
											<span class="min-w-0 flex-1 truncate">{p.title ?? `Problem ${p.number}`}</span
											>
											{#if done}
												<CheckIcon class="size-4 shrink-0 text-primary" aria-hidden="true" />
												<span class="sr-only">Completed</span>
											{/if}
										</a>
									</li>
								{/each}
							</ul>
						</div>
					{/each}
				{/if}
			</section>
		{/if}
	{/if}
</div>
