<!--
	@component
	The signed-in face of `/`: what the user has completed, broken down by topic
	and olympiad, and the badges earned and closest to earning.

	The user's rows come from the page load (uncached). The archive-wide totals
	come from the shared-cached `/api/stats/problems`, so a view never reads the
	whole `problems` table; until they arrive, counts show without a denominator.

	Topics appear only as aggregate counts, never next to a problem: "Recent"
	lists problems without them, to reduce clutter (docs/data-model.md).
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import ListChecksIcon from '@lucide/svelte/icons/list-checks';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Button } from '#lib/components/ui/button/index.js';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import EmptyState from '#lib/components/EmptyState.svelte';
	import OlympiadIcon from '#lib/components/OlympiadIcon.svelte';
	import BadgeMedal from '#lib/components/BadgeMedal.svelte';
	import Meter from '#lib/components/Meter.svelte';
	import { Resource } from '#lib/resource.svelte.js';
	import { PROBLEM_TOPICS, type ProblemTotals } from '#lib/types.js';
	import { formatScore } from '#lib/progress.js';
	import { formatDate } from '#lib/utils/date.js';
	import { plural } from '#lib/utils/plural.js';
	import type { PageData } from './$types';

	type DashboardData = NonNullable<PageData['dashboard']>;

	let { dashboard, userName }: { dashboard: DashboardData; userName: string } = $props();

	/** How many unearned badges "Next up" shows. */
	const NEXT_UP = 3;
	/** How many problems "Recent" shows. */
	const RECENT = 5;

	const totals = new Resource<ProblemTotals>('/api/stats/problems');
	onMount(() => void totals.loadOnce());

	const rows = $derived(dashboard.rows);
	const firstName = $derived(userName.split(/\s+/)[0] || userName);

	/** Scores as a fraction of the max, only where both are known. */
	const scoredPcts = $derived(
		rows.flatMap((r) => (r.score !== null && r.maxScore ? [(r.score / r.maxScore) * 100] : []))
	);
	const averagePct = $derived(
		scoredPcts.length ? scoredPcts.reduce((a, b) => a + b, 0) / scoredPcts.length : null
	);

	const earned = $derived(
		dashboard.badges
			.filter((b) => b.earnedAt !== null)
			.sort((a, b) => +(b.earnedAt ?? 0) - +(a.earnedAt ?? 0))
	);
	/**
	 * Closest to earning first; the sort is stable, so ties stay oldest first.
	 * Badges with a hidden requirement have no count to rank by, and are left out.
	 */
	const nextUp = $derived(
		dashboard.badges
			.flatMap(({ count, requiredCount, summary, ...b }) =>
				b.earnedAt === null && count !== null && requiredCount !== null && summary !== null
					? [{ ...b, count, requiredCount, summary }]
					: []
			)
			.sort((a, b) => b.count / b.requiredCount - a.count / a.requiredCount)
			.slice(0, NEXT_UP)
	);

	const byTopic = $derived(
		PROBLEM_TOPICS.map((topic) => ({
			topic,
			done: rows.filter((r) => r.topics.includes(topic)).length,
			total: totals.value?.byTopic[topic] ?? null
		})).filter((t) => t.done > 0 || (t.total ?? 0) > 0)
	);

	const byOlympiad = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local to one derivation, never mutated after it returns
		const groups = new Map<string, { id: string; name: string; icon: string; done: number }>();
		for (const r of rows) {
			const g = groups.get(r.olympiadId);
			if (g) g.done++;
			else
				groups.set(r.olympiadId, {
					id: r.olympiadId,
					name: r.olympiadName,
					icon: r.olympiadIcon,
					done: 1
				});
		}
		return [...groups.values()]
			.map((g) => ({ ...g, total: totals.value?.byOlympiad[g.id] ?? null }))
			.sort((a, b) => b.done - a.done || a.name.localeCompare(b.name));
	});

	const recent = $derived([...rows].sort((a, b) => +b.updatedAt - +a.updatedAt).slice(0, RECENT));
</script>

<PageHeader title="Welcome back, {firstName}" description="Your progress across the archive.">
	{#snippet actions()}
		<Button variant="outline" size="sm" href={resolve('profile')}>Profile</Button>
	{/snippet}
</PageHeader>

<div class="flex flex-col gap-6 pb-16">
	<!-- Headline numbers -->
	<section aria-label="Summary" class="grid grid-cols-1 gap-3 sm:grid-cols-3">
		<Card.Root class="gap-1 py-5" data-testid="stat-completed">
			<Card.Content class="flex flex-col gap-1">
				<span class="text-sm text-muted-foreground">Problems completed</span>
				<span class="text-3xl font-bold tabular-nums">{rows.length}</span>
				<!-- min-h keeps the tile from growing when the total arrives. -->
				<span class="min-h-4 text-xs text-muted-foreground">
					{totals.value ? `of ${totals.value.total} in the archive` : ''}
				</span>
			</Card.Content>
		</Card.Root>
		<Card.Root class="gap-1 py-5" data-testid="stat-score">
			<Card.Content class="flex flex-col gap-1">
				<span class="text-sm text-muted-foreground">Average score</span>
				<span class="text-3xl font-bold tabular-nums">
					{averagePct === null ? '—' : `${formatScore(averagePct)}%`}
				</span>
				<span class="text-xs text-muted-foreground">
					{scoredPcts.length
						? `across ${plural(scoredPcts.length, 'scored problem')}`
						: 'Record a score to see this'}
				</span>
			</Card.Content>
		</Card.Root>
		<Card.Root class="gap-1 py-5" data-testid="stat-badges">
			<Card.Content class="flex flex-col gap-1">
				<span class="text-sm text-muted-foreground">Badges earned</span>
				<span class="text-3xl font-bold tabular-nums">{earned.length}</span>
				<span class="text-xs text-muted-foreground">
					of {plural(dashboard.badges.length, 'badge')}
				</span>
			</Card.Content>
		</Card.Root>
	</section>

	{#if rows.length === 0}
		<EmptyState
			icon={ListChecksIcon}
			message="No problems tracked yet"
			hint="Mark a problem as done on any olympiad page, and your progress shows up here."
		>
			{#snippet action()}
				<Button href={resolve('olympiads')}>Browse olympiads</Button>
			{/snippet}
		</EmptyState>
	{/if}

	<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
		<!-- Badges -->
		<Card.Root class="lg:order-2">
			<Card.Header class="flex flex-row items-center justify-between">
				<Card.Title>Badges</Card.Title>
				<Button variant="link" size="sm" class="h-auto p-0" href={resolve('badges')}>
					All badges
				</Button>
			</Card.Header>
			<Card.Content class="flex flex-col gap-5">
				{#if earned.length > 0}
					<ul aria-label="Earned badges" class="grid grid-cols-1 gap-3 xs:grid-cols-2">
						{#each earned as badge (badge.id)}
							<li class="flex items-center gap-3">
								<BadgeMedal icon={badge.icon} color={badge.color} size="sm" />
								<div class="flex min-w-0 flex-col">
									<a
										href={resolve(`badges/${badge.id}`)}
										class="truncate text-sm font-medium hover:underline"
									>
										{badge.name}
									</a>
									<span class="text-xs text-muted-foreground">
										{formatDate(badge.earnedAt, 'short')}
									</span>
								</div>
							</li>
						{/each}
					</ul>
				{:else if dashboard.badges.length > 0}
					<p class="m-0 text-sm text-muted-foreground">
						None yet. Complete problems to earn your first.
					</p>
				{:else}
					<p class="m-0 text-sm text-muted-foreground">There are no badges to earn yet.</p>
				{/if}

				{#if nextUp.length > 0}
					<div class="flex flex-col gap-3">
						<h3 class="m-0 text-sm font-semibold">Next up</h3>
						<ul aria-label="Next up" class="flex flex-col gap-3">
							{#each nextUp as badge (badge.id)}
								<li class="flex items-center gap-3">
									<BadgeMedal icon={badge.icon} color={badge.color} size="sm" earned={false} />
									<div class="flex min-w-0 flex-1 flex-col gap-1">
										<div class="flex items-baseline justify-between gap-2">
											<a
												href={resolve(`badges/${badge.id}`)}
												class="truncate text-sm font-medium hover:underline"
											>
												{badge.name}
											</a>
											<span class="shrink-0 text-xs text-muted-foreground tabular-nums">
												{badge.count}/{badge.requiredCount}
											</span>
										</div>
										<span class="truncate text-xs text-muted-foreground">{badge.summary}</span>
										<Meter
											value={badge.count}
											max={badge.requiredCount}
											label="{badge.name} progress"
										/>
									</div>
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			</Card.Content>
		</Card.Root>

		{#if rows.length > 0}
			<!-- By topic -->
			<Card.Root class="lg:order-1">
				<Card.Header>
					<Card.Title>By topic</Card.Title>
				</Card.Header>
				<Card.Content>
					<ul aria-label="By topic" class="flex flex-col gap-3">
						{#each byTopic as t (t.topic)}
							<li class="flex flex-col gap-1">
								<div class="flex items-baseline justify-between gap-2 text-sm">
									<span>{t.topic}</span>
									<span class="text-xs text-muted-foreground tabular-nums">
										{t.done}{t.total === null ? '' : ` / ${t.total}`}
									</span>
								</div>
								<Meter value={t.done} max={t.total} label="{t.topic} completed" />
							</li>
						{/each}
					</ul>
				</Card.Content>
			</Card.Root>

			<!-- By olympiad -->
			<Card.Root class="lg:order-3">
				<Card.Header>
					<Card.Title>By olympiad</Card.Title>
				</Card.Header>
				<Card.Content>
					<ul aria-label="By olympiad" class="flex flex-col gap-3">
						{#each byOlympiad as o (o.id)}
							<li class="flex items-center gap-3">
								<OlympiadIcon icon={o.icon} id={o.id} size="sm" />
								<div class="flex min-w-0 flex-1 flex-col gap-1">
									<div class="flex items-baseline justify-between gap-2 text-sm">
										<a class="truncate hover:underline" href={resolve(`olympiads/${o.id}`)}
											>{o.name}</a
										>
										<span class="shrink-0 text-xs text-muted-foreground tabular-nums">
											{o.done}{o.total === null ? '' : ` / ${o.total}`}
										</span>
									</div>
									<Meter value={o.done} max={o.total} label="{o.name} completed" />
								</div>
							</li>
						{/each}
					</ul>
				</Card.Content>
			</Card.Root>

			<!-- Recent -->
			<Card.Root class="lg:order-4">
				<Card.Header>
					<Card.Title>Recent</Card.Title>
				</Card.Header>
				<Card.Content>
					<ul aria-label="Recent" class="flex flex-col divide-y divide-border">
						{#each recent as r (`${r.olympiadId}:${r.year}:${r.number}`)}
							<li class="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
								<OlympiadIcon icon={r.olympiadIcon} id={r.olympiadId} size="sm" />
								<a
									class="min-w-0 flex-1 truncate text-sm hover:underline"
									href={resolve(`olympiads/${r.olympiadId}#${r.year}`)}
								>
									{r.olympiadName}
									{r.year} · {r.number}{r.title ? ` · ${r.title}` : ''}
								</a>
								{#if r.score !== null}
									<span class="shrink-0 text-xs text-muted-foreground tabular-nums">
										{formatScore(r.score)}{r.maxScore ? ` / ${formatScore(r.maxScore)}` : ''}
									</span>
								{/if}
							</li>
						{/each}
					</ul>
				</Card.Content>
			</Card.Root>
		{/if}
	</div>
</div>
