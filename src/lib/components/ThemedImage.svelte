<script lang="ts">
	import { cn } from '$lib/utils.js';

	/**
	 * An image with separate light and dark sources.
	 *
	 * Renders both and lets CSS pick, rather than branching on
	 * `mode.current` — that reads a store which is unset during SSR, so the
	 * server would emit the light variant and the client would swap it on hydrate.
	 * `app.css` defines the `dark` variant over the same `.dark` class
	 * mode-watcher toggles, so the two are exactly equivalent at runtime.
	 *
	 * @param swap inverts the pairing, for marks sitting on an inverted surface
	 *   (e.g. the white-on-dark login button).
	 */
	let {
		light,
		dark,
		alt,
		class: className,
		swap = false
	}: {
		light: string;
		dark: string;
		alt: string;
		class?: string;
		swap?: boolean;
	} = $props();
</script>

<img src={light} {alt} class={cn(className, swap ? 'hidden dark:block' : 'dark:hidden')} />
<img src={dark} {alt} class={cn(className, swap ? 'dark:hidden' : 'hidden dark:block')} />
