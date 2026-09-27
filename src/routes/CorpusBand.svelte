<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { gsap } from 'gsap';
	import type { Picture } from '@sveltejs/enhanced-img';
	import type { OlympiadEntry } from '$lib/types';
	import { CORPUS } from './corpus';
	import CorpusTile from './CorpusTile.svelte';

	// Thumbnails, resolved at build time. `enhanced: true` gives a `Picture` for
	// `<enhanced:img>`; eager so the map exists on first render.
	const thumbModules = import.meta.glob('/src/lib/assets/thumbs/*.png', {
		eager: true,
		query: { enhanced: true },
		import: 'default'
	}) as Record<string, Picture>;

	const thumbs: Record<string, Picture> = {};
	for (const [path, picture] of Object.entries(thumbModules)) {
		// '/src/lib/assets/thumbs/ipho-1967.png' → 'ipho-1967'
		const filename = path.split('/').pop() ?? '';
		thumbs[filename.replace(/\.[^.]+$/, '')] = picture;
	}

	/**
	 * `olympiads.id → icon`, fetched on mount rather than hardcoded in `corpus.ts`,
	 * because hardcoded icons go stale. `/api/olympiads` is served from the shared
	 * cache. No failure branch: tiles are readable without icons.
	 */
	let icons = $state<Record<string, string>>({});

	onMount(async () => {
		try {
			const res = await fetch('/api/olympiads');
			if (!res.ok) return;
			const rows: OlympiadEntry[] = await res.json();
			icons = Object.fromEntries(rows.map((o) => [o.id, o.icon]));
		} catch {
			// Tiles render without icons.
		}
	});

	const half = Math.ceil(CORPUS.length / 2);
	const rows = [CORPUS.slice(0, half), CORPUS.slice(half)];

	/** Drift speed in CSS px per second. Slow enough to click a tile. */
	const SPEED = 26;

	/**
	 * False until `onMount` checks `prefers-reduced-motion`. While false, each row
	 * shows one static, centred set; reduced-motion visitors keep that layout.
	 */
	let animate = $state(false);

	/**
	 * Repeats of each row's set. The track must be at least one set wider than
	 * the viewport for a seamless loop, and tile width varies by breakpoint, so
	 * this is measured in `build()`.
	 */
	let copies = $state(2);

	let bandEl = $state<HTMLElement>();
	/** Each row's moving track. Its first child (one set) is measured for the loop distance. */
	let trackEls = $state<HTMLElement[]>([]);

	onMount(() => {
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		animate = true;

		let ctx: gsap.Context | undefined;
		let tweens: gsap.core.Tween[] = [];
		let resizeTimer: ReturnType<typeof setTimeout> | undefined;
		let stopped = false;

		const gapOf = (el: Element | null) =>
			el ? parseFloat(getComputedStyle(el).columnGap) || 0 : 0;

		const build = async () => {
			await tick();
			const set = trackEls[0]?.firstElementChild;
			if (stopped || !set) return;

			// One set plus its trailing gap: after this distance the track looks
			// identical, so the wrap is invisible.
			const step = set.getBoundingClientRect().width + gapOf(trackEls[0]);
			if (step <= 0) return;

			const need = Math.max(2, Math.ceil((window.innerWidth + step) / step));
			if (need !== copies) {
				copies = need;
				await tick();
				if (stopped) return;
			}

			ctx?.revert();
			tweens = [];
			ctx = gsap.context(() => {
				trackEls.forEach((track, i) => {
					// Row 2 starts half a tile along so the rows aren't aligned at rest.
					const phase = i === 1 ? step / (rows[i].length * 2) : 0;

					// Row 1 moves left, row 2 right; each travels `step` and repeats.
					const from = i === 0 ? phase : phase - step;
					const to = i === 0 ? phase - step : phase;

					tweens.push(
						gsap.fromTo(
							track,
							{ x: from },
							{ x: to, duration: step / SPEED, ease: 'none', repeat: -1 }
						)
					);
				});
			}, bandEl);
		};

		void build();

		// Rebuild on width changes only. Each rebuild resets the drift, and mobile
		// URL-bar collapse fires height-only resizes while scrolling.
		let lastWidth = window.innerWidth;
		const onResize = () => {
			if (window.innerWidth === lastWidth) return;
			lastWidth = window.innerWidth;
			clearTimeout(resizeTimer);
			resizeTimer = setTimeout(() => void build(), 200);
		};
		window.addEventListener('resize', onResize);

		// Pause while off-screen.
		const io = new IntersectionObserver(
			([entry]) => tweens.forEach((t) => (entry.isIntersecting ? t.play() : t.pause())),
			{ rootMargin: '200px' }
		);
		if (bandEl) io.observe(bandEl);

		// Hover pauses the drift. Wired here rather than as attributes to avoid an
		// a11y warning on `<section>`. Gated on `(hover: hover)` because a tap fires
		// `mouseenter` with no `mouseleave`, which would stop the band for good.
		const canHover = window.matchMedia('(hover: hover)').matches;
		const pause = () => tweens.forEach((t) => t.pause());
		const resume = () => tweens.forEach((t) => t.play());
		if (canHover && bandEl) {
			bandEl.addEventListener('mouseenter', pause);
			bandEl.addEventListener('mouseleave', resume);
		}

		return () => {
			stopped = true;
			clearTimeout(resizeTimer);
			window.removeEventListener('resize', onResize);
			bandEl?.removeEventListener('mouseenter', pause);
			bandEl?.removeEventListener('mouseleave', resume);
			io.disconnect();
			ctx?.revert();
		};
	});
</script>

<!--
	Full-bleed via negative margins, not `100vw` (which includes the scrollbar and
	adds horizontal scroll). The margins undo +layout.svelte's column: `px-4`, then
	`lg:w-5/6` (10% gutters) and `xl:w-2/3` (25% gutters). Update them together.
	`overflow-x-clip` clips without creating a scroll container.
-->
<section
	bind:this={bandEl}
	class="corpus-band relative -mx-4 overflow-x-clip lg:-mx-[calc(10%+1rem)] xl:-mx-[calc(25%+1rem)]"
	style="mask-image: linear-gradient(to right, transparent, #000 7%, #000 93%, transparent); -webkit-mask-image: linear-gradient(to right, transparent, #000 7%, #000 93%, transparent);"
>
	<div class="flex flex-col gap-4 py-2">
		{#each rows as row, i (i)}
			<!--
				Still layout (before mount, or reduced motion): one centred set per row,
				row 2 shifted half a tile. Use a transform for the shift, not a negative
				margin, which on a centred row moves it only half as far.
			-->
			<div
				bind:this={trackEls[i]}
				class="flex flex-row gap-4 {animate
					? 'will-change-transform'
					: i === 1
						? '-translate-x-16 justify-center sm:-translate-x-20 lg:-translate-x-24'
						: 'justify-center'}"
			>
				{#each { length: animate ? copies : 1 }, c (c)}
					<div class="flex flex-row gap-4">
						{#each row as entry (entry.slug)}
							<CorpusTile
								{entry}
								thumb={thumbs[entry.slug]}
								icon={icons[entry.olympiad]}
								clone={c > 0}
							/>
						{/each}
					</div>
				{/each}
			</div>
		{/each}
	</div>
</section>
