<script lang="ts">
	import { Button } from '$lib/components/ui/button/index';
	import { mode } from 'mode-watcher';

	import GitHubWhite from '$lib/assets/icons/GitHub_Invertocat_White.svg';
	import GitHubBlack from '$lib/assets/icons/GitHub_Invertocat_Black.svg';
</script>

{#if mode.current == 'dark'}
	<Button variant="ghost" size="icon" href="https://github.com/apchrme/phoxiv" target="_blank"
		><img alt="GitHub" src={GitHubWhite} class="scale-60 opacity-75" /></Button
	>
{:else}
	<Button variant="ghost" size="icon" href="https://github.com/apchrme/phoxiv" target="_blank"
		><img alt="GitHub" src={GitHubBlack} class="scale-60 opacity-75" /></Button
	>
{/if}
