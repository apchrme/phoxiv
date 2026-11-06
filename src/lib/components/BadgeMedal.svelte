<script lang="ts">
	import AwardIcon from '@lucide/svelte/icons/award';
	import { BADGE_COLORS, isBadgeColor, isBadgeIcon } from '#lib/badges.js';
	import { BADGE_ICONS } from '#lib/badge-icons.js';
	import { cn } from '#lib/utils.js';

	/**
	 * A badge's icon on a tinted disc, used by the dashboard, `/badges` and the
	 * admin editor. Unearned badges are drawn muted rather than hidden, so the
	 * user can see what is left to earn. An unknown icon or colour (a key since
	 * removed from the curated lists) falls back rather than failing.
	 */
	const SIZES = {
		sm: { disc: 'size-8', icon: 'size-4' },
		md: { disc: 'size-12', icon: 'size-6' },
		lg: { disc: 'size-16', icon: 'size-8' }
	} as const;

	let {
		icon,
		color,
		earned = true,
		size = 'md',
		class: className
	}: {
		/** A key of `BADGE_ICONS`. */
		icon: string;
		/** A key of `BADGE_COLORS`. */
		color: string;
		/** `false` draws it greyed out. */
		earned?: boolean;
		size?: keyof typeof SIZES;
		class?: string;
	} = $props();

	const Icon = $derived(isBadgeIcon(icon) ? BADGE_ICONS[icon] : AwardIcon);
	const palette = $derived(BADGE_COLORS[isBadgeColor(color) ? color : 'mauve']);
</script>

<span
	aria-hidden="true"
	class={cn(
		'inline-flex shrink-0 items-center justify-center rounded-full ring-2',
		SIZES[size].disc,
		earned ? [palette.bg, palette.fg, palette.ring] : 'bg-muted text-muted-foreground ring-border',
		className
	)}
>
	<Icon class={SIZES[size].icon} />
</span>
