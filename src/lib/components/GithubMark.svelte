<script lang="ts">
	import ThemedImage from '$lib/components/ThemedImage.svelte';
	import GithubBlack from '$lib/assets/icons/GitHub_Invertocat_Black.svg';
	import GithubWhite from '$lib/assets/icons/GitHub_Invertocat_White.svg';

	/**
	 * The GitHub logomark, inline in text.
	 *
	 * @param invert for an inverted surface, like the `bg-foreground` login button.
	 */
	const { invert = false, class: className = 'size-5' }: { invert?: boolean; class?: string } =
		$props();
</script>

<ThemedImage light={GithubBlack} dark={GithubWhite} alt="GitHub" class={className} swap={invert} />
