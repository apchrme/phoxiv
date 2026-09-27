<script lang="ts">
	import { LogIn } from '@lucide/svelte';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import UserAvatar from '$lib/components/UserAvatar.svelte';
	import { resolve } from '$app/paths';
	import { cn } from '$lib/utils.js';

	/**
	 * The nav's account control: the user's avatar linking to their profile, or a
	 * sign-in button. The anchor owns the size and ring, since it is the hit area.
	 */
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
		<UserAvatar {user} class="size-full object-cover" />
	</a>
{:else}
	<a
		href={resolve('/login')}
		class={cn(buttonVariants({ variant: 'outline', size: 'icon' }), 'gap-1.5')}
	>
		<LogIn />
	</a>
{/if}
