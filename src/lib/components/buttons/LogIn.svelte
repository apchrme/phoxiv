<script lang="ts">
	import { User, LogIn } from '@lucide/svelte';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import { resolve } from '$app/paths';
	import { cn } from '$lib/utils.js';

	const { user } = $props();
</script>

{#if user}
	<a
		href={resolve('/profile')}
		class={cn(
			buttonVariants({ variant: 'ghost', size: 'icon' }),
			'relative overflow-hidden rounded-full p-0 ring-2 ring-border transition-all hover:ring-primary/50'
		)}
		aria-label="Your profile"
		title={user.name}
	>
		{#if user.image}
			<img src={user.image} alt={user.name} class="size-full object-cover" />
		{:else}
			<User class="size-4" />
		{/if}
	</a>
{:else}
	<a
		href={resolve('/login')}
		class={cn(buttonVariants({ variant: 'outline', size: 'icon' }), 'gap-1.5')}
	>
		<LogIn />
	</a>
{/if}
