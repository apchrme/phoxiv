<script lang="ts">
	import { Tabs as TabsPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: TabsPrimitive.TriggerProps = $props();
</script>

<TabsPrimitive.Trigger
	bind:ref
	data-slot="tabs-trigger"
	class={cn(
		"relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-xl border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start group-data-vertical/tabs:px-2.5 group-data-vertical/tabs:py-1.5 hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 dark:text-muted-foreground dark:hover:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
		'group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent dark:group-data-[variant=line]/tabs-list:data-active:border-transparent dark:group-data-[variant=line]/tabs-list:data-active:bg-transparent',
		// **Customised (do not re-add from the CLI — CLAUDE.md rule 2).** Upstream
		// paints the dark active state with `--input` at 30% opacity, over a border
		// of `--input` at full strength. That assumes a palette where `--input`
		// differs from the `--muted` that `tabs-list` paints the track with. In
		// Catppuccin Mocha the two are the *same* colour, Surface 1 (#45475a), so a
		// 30% Surface 1 fill over a Surface 1 track composites straight back to the
		// track and the border vanishes into it — the selected tab had no background
		// of its own at all in dark mode. Light mode was never affected: there the
		// active pill is Base over a Surface 0 track, two distinct tokens.
		//
		// The replacement keeps upstream's *metaphor* — the active pill is one step
		// lighter than the track — in this project's own dark-glass idiom, the
		// translucent white fill and hairline that `glass` and `glass-hairline` use.
		// Over Surface 1 that composites to ≈ #585a6a, which is Surface 2: the
		// canonical next step up in this palette.
		//
		// Class names are spelled out in prose above rather than in backticks
		// because Tailwind scans comments too, and a quoted utility here would emit
		// a dead rule for a class nothing renders.
		'data-active:bg-background data-active:text-foreground dark:data-active:border-white/10 dark:data-active:bg-white/10 dark:data-active:text-foreground',
		'after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-[orientation=horizontal]/tabs:after:inset-x-0 group-data-[orientation=horizontal]/tabs:after:bottom-[-5px] group-data-[orientation=horizontal]/tabs:after:h-0.5 group-data-[orientation=vertical]/tabs:after:inset-y-0 group-data-[orientation=vertical]/tabs:after:-right-1 group-data-[orientation=vertical]/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100',
		className
	)}
	{...restProps}
/>
