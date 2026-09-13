<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { gsap } from 'gsap';
	import type { Picture } from '@sveltejs/enhanced-img';
	import type { OlympiadEntry } from '$lib/types';
	import { CORPUS } from './corpus';
	import CorpusTile from './CorpusTile.svelte';

	// -------------------------------------------------------------------------
	// Thumbnails — resolved at build time
	// -------------------------------------------------------------------------
	// The same `import.meta.glob` idiom as `OlympiadIcon`'s override map, with
	// `query: { enhanced: true }` instead of `'?url'` so Vite hands back a
	// `Picture` for `<enhanced:img>` rather than a bare URL. Eager, because the
	// map has to exist synchronously when the band first renders.
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

	// -------------------------------------------------------------------------
	// Icons — fetched, not hardcoded
	// -------------------------------------------------------------------------
	/**
	 * `olympiads.id → icon`, joined in from `/api/olympiads` on mount.
	 *
	 * Fetched rather than written into `corpus.ts` for the reason the list itself
	 * records: a hardcoded icon goes stale silently. An earlier pass on this page
	 * asserted APhO had none, from a local dev snapshot — it has had a PNG in
	 * production for a while. `/api/olympiads` is answered from Cloudflare's shared
	 * cache, so this costs no D1 read.
	 *
	 * There is deliberately no skeleton and no failure branch: a tile carries its
	 * olympiad, year and file label as text, and the icon simply appears if and
	 * when the join lands.
	 */
	let icons = $state<Record<string, string>>({});

	onMount(async () => {
		try {
			const res = await fetch('/api/olympiads');
			if (!res.ok) return;
			const rows: OlympiadEntry[] = await res.json();
			icons = Object.fromEntries(rows.map((o) => [o.id, o.icon]));
		} catch {
			// Left empty — see above.
		}
	});

	// Two rows of nine. Exactly the length of CORPUS, so a nineteenth entry would
	// unbalance the rows rather than silently disappear.
	const half = Math.ceil(CORPUS.length / 2);
	const rows = [CORPUS.slice(0, half), CORPUS.slice(half)];

	// -------------------------------------------------------------------------
	// The marquee
	// -------------------------------------------------------------------------
	/**
	 * Drift speed in CSS pixels per second, shared by both rows.
	 *
	 * Slow on purpose. This is wallpaper behind a headline, not a carousel: fast
	 * enough that the band is visibly alive at a glance, slow enough that a tile
	 * someone has decided to click does not get away from them.
	 */
	const SPEED = 26;

	/**
	 * False until `onMount` has checked `prefers-reduced-motion`.
	 *
	 * While false the band renders exactly one set per row, centred, with row 2
	 * offset by half a pitch — the static layout, which is also what a visitor who
	 * asked for reduced motion keeps for good. Nothing here is a progressive
	 * enhancement of content: the same eighteen tiles are in the DOM either way.
	 */
	let animate = $state(false);

	/**
	 * How many times each row's nine tiles are repeated.
	 *
	 * A seamless loop needs the track to be at least one full set wider than the
	 * viewport, because the tween travels exactly one set's pitch before snapping
	 * back — so `ceil((viewport + step) / step)`. Computed from the measured set
	 * rather than assumed, since the tile width changes at `sm` and `lg`, and two
	 * copies (enough for a laptop) leave a bare patch on an ultrawide.
	 */
	let copies = $state(2);

	let bandEl = $state<HTMLElement>();
	/**
	 * The moving element in each row: a flex row of `copies` sets. Its first child
	 * is one set, which is what gets measured to derive the loop distance.
	 */
	let trackEls = $state<HTMLElement[]>([]);

	onMount(() => {
		// The whole marquee is opt-out, not opt-in: a continuously moving band is
		// exactly what `prefers-reduced-motion` exists to suppress, and unlike the
		// scroll reveals there is no "make it instant" version of an infinite loop.
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

			// One set plus the gap that follows it — the distance after which the
			// track looks identical to where it started, which is what makes the
			// tween's wrap invisible.
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
					// Row 2 starts half a tile pitch along, so the two rows are not in
					// phase at t = 0. They still pass through alignment periodically —
					// with uniform tiles and opposite directions that is unavoidable —
					// but it is a moment in passing rather than the resting state.
					const phase = i === 1 ? step / (rows[i].length * 2) : 0;

					// Opposite directions. Row 1 walks left, row 2 walks right; each
					// travels exactly `step` and snaps back, so neither ever runs out of
					// tiles on the side it is heading towards.
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

		// A resize can cross the `sm`/`lg` breakpoints, which changes the tile width
		// and therefore both the loop distance and how many copies are needed.
		//
		// Width only, deliberately. `build()` ends in a fresh `fromTo`, which puts both
		// tracks back at x = `from` — every rebuild is a visible reset of the drift. On
		// a phone, scrolling the page collapses and expands the browser's URL bar, and
		// each of those fires `resize` with `innerWidth` untouched, so the band jumped
		// back to its start whenever someone scrolled past it. Nothing here is measured
		// against the viewport's height, so ignoring a height-only resize costs nothing.
		let lastWidth = window.innerWidth;
		const onResize = () => {
			if (window.innerWidth === lastWidth) return;
			lastWidth = window.innerWidth;
			clearTimeout(resizeTimer);
			resizeTimer = setTimeout(() => void build(), 200);
		};
		window.addEventListener('resize', onResize);

		// Off-screen, the tween would still tick every frame for nothing. The band
		// spends most of the page's scroll height out of view.
		const io = new IntersectionObserver(
			([entry]) => tweens.forEach((t) => (entry.isIntersecting ? t.play() : t.pause())),
			{ rootMargin: '200px' }
		);
		if (bandEl) io.observe(bandEl);

		// Hover pauses the drift, so a tile someone is aiming at holds still.
		//
		// Wired here rather than as `onmouseenter` attributes for two reasons: a
		// `<section>` carrying mouse handlers trips `a11y_no_static_element_interactions`,
		// and giving it a role it does not have to quiet the warning would be worse
		// than the warning. It is also gated on `(hover: hover)` — on a touch screen
		// a tap synthesises `mouseenter` with no `mouseleave` to follow, which would
		// leave the band stopped for good.
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
	Full-bleed, without `100vw`.

	The shell is `w-full lg:w-5/6 xl:w-2/3` inside a `px-4` wrapper (+layout.svelte),
	and nothing in the shell sets `overflow`. The obvious escape —
	`left-1/2 w-screen -translate-x-1/2` — adds a horizontal scrollbar, because
	`100vw` includes the scrollbar's own width.

	Negative margins do not have that problem: a percentage margin resolves against
	the *containing block*, which here is the column itself, so the inset to the
	viewport edge is exactly computable at each breakpoint. Writing C for the
	column width and using the layout's own fractions:

	  • below lg — the column is full width, inset = 1rem            → -mx-4
	  • at lg    — the column is 5/6, so each gutter is C/5/2 = 0.1C  → 10% + 1rem
	  • at xl    — the column is 2/3, so each gutter is C/2/2 = 0.25C → 25% + 1rem

	`overflow-x-clip` (not `-auto`, not `-hidden`) contains the rows' own overflow
	without establishing a scroll container, so nothing can scroll sideways and
	`position: sticky` elsewhere on the page is unaffected.
-->
<section
	bind:this={bandEl}
	class="corpus-band relative -mx-4 overflow-x-clip lg:-mx-[calc(10%+1rem)] xl:-mx-[calc(25%+1rem)]"
	style="mask-image: linear-gradient(to right, transparent, #000 7%, #000 93%, transparent); -webkit-mask-image: linear-gradient(to right, transparent, #000 7%, #000 93%, transparent);"
>
	<div class="flex flex-col gap-4 py-2">
		{#each rows as row, i (i)}
			<!--
				Both rows sit on one baseline — no vertical stagger, drifting or still.

				**Moving** (the default): the track holds `copies` repeats of the row and
				GSAP walks it exactly one set's pitch before snapping back, so the wrap is
				invisible and neither direction ever reaches an end. Row 1 goes left, row 2
				goes right. Because the track is wider than the viewport in the direction
				of travel, there is no right-hand limit to reach at any screen width.

				**Still** (`prefers-reduced-motion`, and the first frame before `onMount`):
				one set per row, centred, with row 2 pushed half a pitch left so the two
				rows do not line up vertically — 64/80/96px at the three tile widths.

				`justify-center` is what makes that still layout symmetric. A row of nine
				tiles is ~1712px, wider than the viewport at every breakpoint, and the
				default `flex-start` spends all of the overhang on the right — the band
				then looks pinned to the left edge rather than sliced out of something
				larger. It is dropped once the marquee owns the position.

				The still offset is a transform, not a negative margin. A negative margin
				on a `justify-center` row both moves the box and widens it, so the centred
				content travels only half as far — `-ml-24` measured as a 48px offset, and
				the rows read as very nearly aligned.

				Overflowing either way is safe only because the band clips it:
				`overflow-x-clip` on the section means the overhang cannot become an
				unreachable scroll region.
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
