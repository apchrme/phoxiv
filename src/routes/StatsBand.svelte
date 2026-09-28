<script lang="ts">
	import { onMount } from 'svelte';
	import { gsap } from 'gsap';
	import { ScrollTrigger } from 'gsap/ScrollTrigger';
	import { Resource } from '$lib/resource.svelte';

	/**
	 * Null until the counts arrive, and on failure. Don't seed it with zeroes, or
	 * a failed fetch shows an empty archive.
	 */
	const stats = new Resource<Record<string, number>>('/api/stats');

	onMount(() => void stats.loadOnce());

	const items = $derived([
		{ value: stats.value?.olympiads, label: 'Olympiads' },
		{ value: stats.value?.years, label: 'Years' },
		{ value: stats.value?.files, label: 'Files' }
	]);

	/**
	 * Each reel holds 0–9 this many times over. It spins through all but the last
	 * pass and stops on its digit in the last one, so every reel turns at least
	 * `PASSES - 1` full revolutions, even one that lands on 0.
	 */
	const PASSES = 3;
	const CELLS = Array.from({ length: PASSES * 10 }, (_, i) => i % 10);

	const digitsOf = (n: number) => String(n).split('').map(Number);

	let bandEl = $state<HTMLElement>();

	// An effect, not onMount: the reels only exist once the counts have arrived,
	// and effects run after the DOM has been updated with them.
	$effect(() => {
		if (!stats.value || !bandEl) return;

		gsap.registerPlugin(ScrollTrigger);

		const ctx = gsap.context(() => {
			const tl = gsap.timeline({ paused: true });

			gsap.utils.toArray<HTMLElement>('.stat-reels', bandEl).forEach((reels, s) => {
				const strips = gsap.utils.toArray<HTMLElement>('.stat-strip', reels);
				strips.forEach((strip, j) => {
					const target = (PASSES - 1) * 10 + Number(strip.dataset.digit);
					tl.to(
						strip,
						{
							// yPercent, not y, so the travel scales with the font size. It is a
							// percentage of the strip, so the strip must keep its full height:
							// see `items-start` on the window below.
							yPercent: (-100 * target) / CELLS.length,
							// Reels further right spin longer and land later, like an
							// odometer settling from the left.
							duration: 1.6 + 0.25 * j,
							ease: 'power4.out'
						},
						s * 0.15
					);
				});
			});

			if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
				tl.progress(1);
				return;
			}

			// onLeave as well as onEnter, so a load already scrolled past the band
			// still ends on the real numbers rather than a row of zeroes.
			ScrollTrigger.create({
				trigger: bandEl,
				start: 'top 88%',
				once: true,
				onEnter: () => void tl.play(),
				onLeave: () => void tl.play()
			});
		}, bandEl);

		return () => ctx.revert();
	});
</script>

<section bind:this={bandEl} class="stats-band">
	<dl class="m-0 grid grid-cols-1 gap-5 xs:grid-cols-3 sm:gap-8">
		{#each items as { value, label } (label)}
			<!-- Reversed so the dt can come first in the markup, as <dl> requires. -->
			<div class="flex flex-col-reverse items-center gap-2 text-center">
				<dt class="font-mono text-xs tracking-widest text-muted-foreground uppercase">
					{label}
				</dt>
				<!-- Weight 1000 to match the headlines; see the note in +page.svelte. -->
				<dd class="m-0 font-mono font-[1000] tracking-tight text-foreground">
					{#if value === undefined}
						<!-- Same line box as a reel, so the band doesn't jump when counts land. -->
						<span class="block text-4xl text-foreground/15 md:text-6xl">—</span>
					{:else}
						<span class="sr-only">{value}</span>
						<!--
							One reel per digit: a window one cell tall over a strip of CELLS.
							The mask fades the top and bottom edge so the strip reads as a
							drum turning, not a list sliding.
						-->
						<span
							class="stat-reels flex h-[2.5em] items-start gap-1 overflow-hidden tabular-nums md:h-[4em]"
							style="mask-image: linear-gradient(transparent, #000 18%, #000 82%, transparent); -webkit-mask-image: linear-gradient(transparent, #000 18%, #000 82%, transparent);"
							aria-hidden="true"
						>
							{#each digitsOf(value) as digit, j (j)}
								<span class="stat-strip flex flex-col will-change-transform" data-digit={digit}>
									{#each CELLS as cell, c (c)}
										<span class="block text-center text-4xl md:text-6xl">{cell}</span>
									{/each}
								</span>
							{/each}
						</span>
					{/if}
				</dd>
			</div>
		{/each}
	</dl>
</section>
