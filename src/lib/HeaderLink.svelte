<script lang="ts">
	import { page } from '$app/state';
	const { url, label = url.substring(1) } = $props();
</script>

<a href={url} aria-current={page.url.pathname == url}>
	{label}
</a>
