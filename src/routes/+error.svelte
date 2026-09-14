<script lang="ts">
	import { page } from '$app/state';
	import PageHeader from '$lib/components/PageHeader.svelte';

	const descriptions: Record<number, string> = {
		404: "A page link doesn't exist here. Did you type the URL correctly?",
		403: "You need to be a contributor to view this page. A form will be added to the future for you to apply to be a contributor. For now, if you'd like to be a contributor, send me an email at apochrome@proton.me"
	};
</script>

<!-- The status is the title and the message is not. Passing the whole sentence as
     the title set "Uh oh! You have encountered an error 404: Not Found" at
     `text-3xl sm:text-4xl`, which filled the viewport with the least useful
     wording available. -->
<PageHeader title="Error {page.status}">
	<p class="m-0 text-lg font-medium text-foreground">{page.error?.message}</p>
	{#if descriptions[page.status]}
		<p class="m-0 prose text-muted-foreground">{descriptions[page.status]}</p>
	{/if}
</PageHeader>
