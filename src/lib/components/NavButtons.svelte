<script>
	import DarkModeButton from '$lib/components/buttons/DarkModeButton.svelte';
	import DiscordButton from '$lib/components/buttons/DiscordButton.svelte';
	import GitHubButton from '$lib/components/buttons/GitHubButton.svelte';
</script>

<div class="flex flex-row items-center gap-3">
	<GitHubButton />
	<DiscordButton />
	<DarkModeButton />
</div>
