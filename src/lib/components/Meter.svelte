<script lang="ts">
	import { cn } from '#lib/utils.js';

	/**
	 * A thin horizontal bar for "done out of total": the dashboard's breakdowns
	 * and badge progress. `max` may be unknown while totals load, which draws an
	 * empty track rather than a misleading full bar.
	 */
	let {
		value,
		max,
		label,
		class: className
	}: {
		value: number;
		/** `null` or `0` draws an empty track. */
		max: number | null | undefined;
		/** What the bar measures, for screen readers. */
		label: string;
		class?: string;
	} = $props();

	const fraction = $derived(max ? Math.min(1, Math.max(0, value / max)) : 0);
</script>

<div
	role="meter"
	aria-label={label}
	aria-valuemin={0}
	aria-valuemax={max || undefined}
	aria-valuenow={value}
	class={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}
>
	<div
		class="h-full rounded-full bg-primary transition-[width]"
		style:width="{fraction * 100}%"
	></div>
</div>
