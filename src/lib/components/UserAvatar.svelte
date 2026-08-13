<script lang="ts">
	import { User } from '@lucide/svelte';
	import { cn } from '$lib/utils.js';

	/**
	 * A user's profile picture, falling back to a glyph when they have none.
	 *
	 * `class` carries the sizing and ring so the three call sites (admin table,
	 * mobile sidebar, profile page) can stay visually distinct without this
	 * component growing a prop per difference.
	 */
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
