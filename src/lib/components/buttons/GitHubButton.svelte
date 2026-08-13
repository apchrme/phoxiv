<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import ThemedImage from '$lib/components/ThemedImage.svelte';

	import GitHubWhite from '$lib/assets/icons/GitHub_Invertocat_White.svg';
	import GitHubBlack from '$lib/assets/icons/GitHub_Invertocat_Black.svg';
</script>

<Button variant="outline" size="icon" href="https://github.com/apchrme/phoxiv" target="_blank">
	<ThemedImage light={GitHubBlack} dark={GitHubWhite} alt="GitHub" class="scale-70 opacity-75" />
</Button>
