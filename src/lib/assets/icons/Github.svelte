<script lang="ts">
	import { mode } from 'mode-watcher';
	import GithubBlack from './GitHub_Invertocat_Black.svg';
	import GithubWhite from './GitHub_Invertocat_White.svg';
    
    const {invert=false} = $props();

</script>
{#if mode.current == "dark" != invert}
    <img src={GithubWhite} class="size-5" alt="Github" />
{:else}
    <img src={GithubBlack} class="size-5" alt="Github" />
{/if}