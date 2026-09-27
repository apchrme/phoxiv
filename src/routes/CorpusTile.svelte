<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Picture } from '@sveltejs/enhanced-img';
	import OlympiadIcon from '$lib/components/OlympiadIcon.svelte';
	import type { CorpusEntry } from './corpus';

	let {
		entry,
		thumb,
		icon,
		clone = false
	}: {
		entry: CorpusEntry;
		/** The page thumbnail. Absent only if the PNG is missing. */
		thumb?: Picture;
		/** The olympiad's icon. Undefined until `/api/olympiads` answers, or if it fails. */
		icon?: string;
		/** A marquee repeat: hidden from assistive tech and the tab order. */
		clone?: boolean;
	} = $props();
</script>

<!-- The olympiad page scrolls to `#<year>`. Keep `resolve()` inline: in a
     `$derived` the lint rule can't see it. -->
<a
	href={resolve(`/olympiads/${entry.olympiad}#${entry.year}`)}
	aria-hidden={clone ? 'true' : undefined}
	tabindex={clone ? -1 : undefined}
	class="group block w-28 shrink-0 rounded-xl bg-card ring-1 ring-foreground/10 transition-all duration-250 hover:-translate-y-2 hover:ring-primary/50 sm:w-36 lg:w-44"
>
	<!-- `aspect-[420/594]` matches the renderer's output, reserving space before decode. -->
	<div class="aspect-[420/594] w-full overflow-hidden rounded-t-xl bg-white">
		{#if thumb}
			<enhanced:img
				src={thumb}
				alt=""
				loading="lazy"
				decoding="async"
				class="h-full w-full object-cover object-top"
			/>
		{/if}
	</div>

	<div class="flex flex-col gap-0.5 rounded-b-xl px-2 py-2">
		<div class="flex items-center gap-1.5">
			<!-- The slot is always reserved so the label doesn't shift. Don't render
			     `OlympiadIcon` before the icon arrives: blank, it shows an alert icon. -->
			<span class="flex h-3.5 w-3.5 shrink-0 items-center">
				{#if icon !== undefined}
					<OlympiadIcon {icon} id={entry.olympiad} size="xs" />
				{/if}
			</span>
			<span class="truncate text-[0.7rem] leading-none font-medium text-foreground">
				{entry.label}
			</span>
		</div>
		<div class="flex items-baseline gap-1.5 font-mono text-[0.65rem] leading-none">
			<span class="text-muted-foreground tabular-nums">{entry.year}</span>
			{#if entry.num}
				<span class="text-primary">{entry.num}</span>
			{/if}
		</div>
		<span class="truncate text-[0.65rem] leading-tight text-muted-foreground">{entry.file}</span>
	</div>
</a>
