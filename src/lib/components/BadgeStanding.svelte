<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import Meter from '#lib/components/Meter.svelte';
	import { formatDate } from '#lib/utils/date.js';
	import { cn } from '#lib/utils.js';

	/**
	 * Where the viewer stands on one badge: "Earned {date}" once held, otherwise
	 * a progress meter with `count/required`. Used by `/badges`' cards (`sm`) and
	 * a badge's own page (`md`), from `mergeStanding` in #lib/badges.
	 *
	 * Renders nothing without a standing (signed out, or still loading), or
	 * while the requirement is hidden: both numbers are `null` then, because
	 * progress would give the rule away.
	 */
	let {
		name,
		earnedAt,
		count,
		requiredCount,
		size = 'sm',
		earnedLabel = 'Earned',
		class: className
	}: {
		/** The badge's name, for the meter's accessible label. */
		name: string;
		earnedAt: string | null;
		count: number | null;
		requiredCount: number | null;
		size?: 'sm' | 'md';
		/** Words before the date, such as "You earned this". */
		earnedLabel?: string;
		class?: string;
	} = $props();
</script>

{#if earnedAt}
	<p
		class={cn(
			'm-0 flex items-center gap-1 font-medium text-primary',
			size === 'sm' ? 'text-xs' : 'text-sm',
			className
		)}
	>
		<CheckIcon class={size === 'sm' ? 'size-3.5' : 'size-4'} />
		{earnedLabel}
		{formatDate(earnedAt, 'short')}
	</p>
{:else if count !== null && requiredCount !== null}
	<div class={cn('flex w-full items-center gap-2', className)}>
		<Meter value={count} max={requiredCount} label="{name} progress" />
		<span class="shrink-0 text-xs text-muted-foreground tabular-nums">
			{Math.min(count, requiredCount)}/{requiredCount}
		</span>
	</div>
{/if}
