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
		/** The rendered page, globbed by `CorpusBand`. Absent only if the PNG is missing. */
		thumb?: Picture;
		/**
		 * The olympiad's `icon` column, joined in by `CorpusBand` from `/api/olympiads`.
		 * Undefined until that request lands — and permanently if it fails, which is
		 * why the tile never depends on it for meaning.
		 */
		icon?: string;
		/**
		 * True for the repeats the marquee needs to fill a wide screen seamlessly.
		 *
		 * A clone is hidden from assistive tech and taken out of the tab order: the
		 * band renders the same eighteen links three or four times over, and without
		 * this a keyboard user would tab through seventy-odd identical destinations
		 * and a screen reader would read the archive out four times.
		 */
		clone?: boolean;
	} = $props();
</script>

<!-- The `#<year>` deep link is honoured by the olympiad page's hash handler, which
     scrolls to the matching year panel once the panels exist. Written as one inline
     template literal to match `SearchResultItem.svelte`, the other place in the app
     that links to a year — and because hoisting it into a `$derived` hides the
     `resolve()` from `svelte/no-navigation-without-resolve`. -->
<a
	href={resolve(`/olympiads/${entry.olympiad}#${entry.year}`)}
	aria-hidden={clone ? 'true' : undefined}
	tabindex={clone ? -1 : undefined}
	class="group block w-28 shrink-0 rounded-xl bg-card ring-1 ring-foreground/10 transition-all duration-250 hover:-translate-y-2 hover:ring-primary/50 sm:w-36 lg:w-44"
>
	<!-- The page itself. `aspect-[420/594]` is the renderer's output shape, so the
	     box is reserved at the right size before the image decodes even though
	     `enhanced-img` also writes intrinsic dimensions. -->
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

	<!-- Foot — icon, year, problem number where there is one, and the real file label. -->
	<div class="flex flex-col gap-0.5 rounded-b-xl px-2 py-2">
		<div class="flex items-center gap-1.5">
			<!-- The slot is reserved whether or not the icon has arrived, so the label
			     does not jump sideways when the join lands. `OlympiadIcon` is rendered
			     only once there is an icon to render: given a blank one it falls back
			     to a `CircleAlert`, which would read as an error on every tile for as
			     long as `/api/olympiads` is in flight, and for ever if it never lands. -->
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
