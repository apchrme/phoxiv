<script lang="ts">
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
	<button
		onclick={onClear}
		class="mt-3 rounded-4xl border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
	>
		{clearLabel}
	</button>
</div>
