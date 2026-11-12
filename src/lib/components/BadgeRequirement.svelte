<script lang="ts">
	import EyeOffIcon from '@lucide/svelte/icons/eye-off';
	import { cn } from '#lib/utils.js';

	/**
	 * A badge's criteria sentence, or "Requirement hidden" where the viewer may
	 * not see it (`summary` is `null`). Used by `/badges`' cards (`sm`) and a
	 * badge's own page (`md`).
	 */
	let {
		summary,
		size = 'sm'
	}: {
		summary: string | null;
		size?: 'sm' | 'md';
	} = $props();
</script>

{#if summary !== null}
	<p class={cn('m-0', size === 'sm' ? 'text-sm text-muted-foreground' : 'font-medium')}>
		{summary}
	</p>
{:else}
	<p
		class={cn(
			'm-0 flex items-center gap-1.5 text-muted-foreground italic',
			size === 'sm' && 'text-sm'
		)}
	>
		<EyeOffIcon class={cn('shrink-0', size === 'sm' ? 'size-3.5' : 'size-4')} /> Requirement hidden
	</p>
{/if}
