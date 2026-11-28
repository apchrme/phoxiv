<!--
@component
Snow drifting down over `/`, the landing page and the dashboard alike, for a
visitor on the Christmas palette.

Always rendered, server-side too, and shown by CSS alone: mode-watcher sets
`<html data-theme>` before first paint, so the snow neither flashes in for
other palettes nor waits for hydration. Hidden under `prefers-reduced-motion`.
Decorative: `aria-hidden`, and `pointer-events-none` so it never takes a click.
-->
<script lang="ts">
	const COUNT = 48;

	/**
	 * A seeded generator, so the server and the client lay out the same flakes
	 * and hydration has nothing to reconcile.
	 */
	function seeded(seed: number): () => number {
		let s = seed;
		return () => {
			s = (s * 1664525 + 1013904223) % 4294967296;
			return s / 4294967296;
		};
	}

	const random = seeded(1225);
	const flakes = Array.from({ length: COUNT }, () => {
		const size = 3 + random() * 5;
		const duration = 10 + random() * 14;
		return {
			left: random() * 100,
			size,
			duration,
			// Negative, so the snow is already mid-fall when the page opens.
			delay: -random() * duration,
			drift: (random() - 0.5) * 12,
			// Smaller flakes are farther away: fainter.
			opacity: 0.35 + ((size - 3) / 5) * 0.5
		};
	});
</script>

<div
	class="snowfall pointer-events-none fixed inset-0 z-30 overflow-hidden"
	data-slot="snowfall"
	aria-hidden="true"
>
	{#each flakes as flake, i (i)}
		<span
			class="flake absolute top-0 rounded-full bg-snow"
			style:left="{flake.left}%"
			style:width="{flake.size}px"
			style:height="{flake.size}px"
			style:opacity={flake.opacity}
			style:--drift="{flake.drift}vw"
			style:animation-duration="{flake.duration}s"
			style:animation-delay="{flake.delay}s"
		></span>
	{/each}
</div>

<style>
	.snowfall {
		display: none;
	}

	:global(html[data-theme='christmas']) .snowfall {
		display: block;
	}

	@media (prefers-reduced-motion: reduce) {
		:global(html[data-theme='christmas']) .snowfall {
			display: none;
		}
	}

	.flake {
		animation-name: fall;
		animation-timing-function: linear;
		animation-iteration-count: infinite;
		will-change: transform;
	}

	@keyframes fall {
		from {
			transform: translate3d(0, -5vh, 0);
		}
		50% {
			transform: translate3d(var(--drift), 50vh, 0);
		}
		to {
			transform: translate3d(0, 105vh, 0);
		}
	}
</style>
