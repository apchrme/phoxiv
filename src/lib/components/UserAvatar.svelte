<script lang="ts">
	import { User } from '@lucide/svelte';
	import { cn } from '$lib/utils.js';

	/** A user's profile picture, or a glyph if none. `class` sets size and ring. */
	let {
		user,
		class: className = 'size-9 ring-2 ring-border',
		iconClass = 'size-4'
	}: {
		user: { name: string; image?: string | null } | null | undefined;
		class?: string;
		iconClass?: string;
	} = $props();
</script>

{#if user?.image}
	<img src={user.image} alt={user.name} class={cn('shrink-0 rounded-full', className)} />
{:else}
	<div
		class={cn('flex shrink-0 items-center justify-center rounded-full bg-primary/10', className)}
	>
		<User class={cn('text-primary', iconClass)} />
	</div>
{/if}
