<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';

	let {
		message = 'No results found',
		hint = 'Try a different search term.',
		clearLabel = 'Clear search',
		onClear
	}: {
		message?: string;
		hint?: string;
		clearLabel?: string;
		onClear: () => void;
	} = $props();
</script>

<div class="rounded-xl border border-dashed border-border py-12 text-center">
	<p class="mb-1 text-center text-base font-medium text-foreground">{message}</p>
	<p class="mb-0 text-center text-sm text-muted-foreground">{hint}</p>
	<Button variant="outline" size="sm" class="mt-3" onclick={onClear}>
		{clearLabel}
	</Button>
</div>
