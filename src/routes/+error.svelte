<script lang="ts">
	import { page } from '$app/state';
</script>

<h1 class="mt-5 text-center">{page.status}: {page.error?.message}</h1>

{#if (page.status == 404)}
<p class="text-center">A page link doesn't exist here. Did you type the URL correctly?</p>
{/if}