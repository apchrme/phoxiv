<script lang="ts">
	import { page } from '$app/state';
	import Title from '$lib/components/Title.svelte';

	const descriptions: Record<number, string> = {
		404: "A page link doesn't exist here. Did you type the URL correctly?",
		403: "You need to be a contributor to view this page. A form will be added to the future for you to apply to be a contributor. For now, if you'd like to be a contributor, send me an email at apochrome@proton.me"
	}
</script>


<Title title="Uh oh! You have encountered an error {page.status}: {page.error?.message}" description={descriptions[page.status] ?? ""} />
