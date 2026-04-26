<script lang="ts">
	import { resolve } from '$app/paths';
	const { url, label = url.substring(1) } = $props();
</script>

<a href={resolve(url)} target="_blank">
	{label}
</a>
