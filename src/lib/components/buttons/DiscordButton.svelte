<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import ThemedImage from '$lib/components/ThemedImage.svelte';

	import DiscordWhite from '$lib/assets/icons/Discord-Symbol-White.svg';
	import DiscordBlack from '$lib/assets/icons/Discord-Symbol-Black.svg';
</script>

<Button variant="outline" size="icon" href="https://discord.gg/SNBDY5nsgf" target="_blank">
	<ThemedImage light={DiscordBlack} dark={DiscordWhite} alt="Discord" class="scale-60 opacity-75" />
</Button>
