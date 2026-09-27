<script lang="ts">
	import { cn } from '$lib/utils.js';

	/**
	 * An image with light and dark sources. Renders both and lets CSS choose.
	 * Don't branch on `mode.current`: it's unset during SSR, so the image would
	 * swap on hydrate.
	 *
	 * @param swap inverts the pairing, for marks on an inverted surface.
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
