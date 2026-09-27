<script lang="ts">
	import { page } from '$app/state';
	import PageHeader from '$lib/components/PageHeader.svelte';

	const descriptions: Record<number, string> = {
		404: "A page link doesn't exist here. Did you type the URL correctly?",
		403: "You need to be a contributor to view this page. A form will be added to the future for you to apply to be a contributor. For now, if you'd like to be a contributor, send me an email at apochrome@proton.me"
	};
</script>

<!-- Only the status goes in the title; a full sentence is too big at heading size. -->
<PageHeader title="Error {page.status}">
	<p class="m-0 text-lg font-medium text-foreground">{page.error?.message}</p>
	{#if descriptions[page.status]}
		<p class="m-0 prose text-muted-foreground">{descriptions[page.status]}</p>
	{/if}
</PageHeader>
