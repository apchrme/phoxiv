<script lang="ts">
	import { page } from '$app/state';
	import Title from '$lib/components/Title.svelte';

	const descriptions: Record<number, string> = {
		404: "A page link doesn't exist here. Did you type the URL correctly?",
		403: "You do not have authorisation to view this page. You may need to apply to be a contributor. A form will be added to the future, so you can apply then!"
	}
</script>


<Title title="Uh oh! You have encountered an error {page.status}: {page.error?.message}" description={descriptions[page.status] ?? ""} />
