<script lang="ts">
	import { mode } from 'mode-watcher';
	import GithubBlack from './GitHub_Invertocat_Black.svg';
	import GithubWhite from './GitHub_Invertocat_White.svg';

	const { invert = false, class: className = 'size-5' }: { invert?: boolean; class?: string } =
		$props();
</script>

{#if (mode.current == 'dark') != invert}
	<img src={GithubWhite} class={className} alt="Github" />
{:else}
	<img src={GithubBlack} class={className} alt="Github" />
{/if}
