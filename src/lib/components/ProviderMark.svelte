<script lang="ts">
	import type { AuthProviderId } from '#lib/auth-providers.js';
	import ThemedImage from '#lib/components/ThemedImage.svelte';
	import GithubBlack from '#lib/assets/icons/GitHub_Invertocat_Black.svg';
	import GithubWhite from '#lib/assets/icons/GitHub_Invertocat_White.svg';
	import GoogleG from '#lib/assets/icons/Google_G.svg';

	/**
	 * A sign-in provider's logomark. Decorative (`alt=""`): it always sits beside
	 * the provider's name, which would otherwise be read out twice.
	 */
	const { provider, class: className = 'size-5' }: { provider: AuthProviderId; class?: string } =
		$props();
</script>

{#if provider === 'github'}
	<ThemedImage light={GithubBlack} dark={GithubWhite} alt="" class={className} />
{:else}
	<!-- Google's G is multicoloured and reads on both themes, so it has no dark variant. -->
	<img src={GoogleG} alt="" class={className} />
{/if}
