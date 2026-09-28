<script lang="ts">
	import { page } from '$app/state';

	const descriptions: Record<number, string> = {
		404: "A page link doesn't exist here. Did you type the URL correctly?",
		403: "You need to be a contributor to view this page. If you'd like to be a contributor, send me an email at apochrome@proton.me"
	};
</script>

<!-- Only the status goes in the title; a full sentence is too big at heading size. -->

<div class="flex flex-col gap-5 items-center justify-center h-[80svh]">
	<h1 class="text-4xl text-center">Error {page.status}: {page.error?.message}</h1>
	{#if descriptions[page.status]}
		<p class="m-0 prose text-center text-muted-foreground">{descriptions[page.status]}</p>
	{/if}
</div>
