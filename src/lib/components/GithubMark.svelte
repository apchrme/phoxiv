<script lang="ts">
	import ThemedImage from '$lib/components/ThemedImage.svelte';
	import GithubBlack from '$lib/assets/icons/GitHub_Invertocat_Black.svg';
	import GithubWhite from '$lib/assets/icons/GitHub_Invertocat_White.svg';

	/**
	 * The GitHub logomark, inline in text.
	 *
	 * @param invert for marks placed on an inverted surface, such as the
	 *   `bg-foreground` login button, where the light theme needs the *white* mark.
	 */
	const { invert = false, class: className = 'size-5' }: { invert?: boolean; class?: string } =
		$props();
</script>

<ThemedImage light={GithubBlack} dark={GithubWhite} alt="GitHub" class={className} swap={invert} />
