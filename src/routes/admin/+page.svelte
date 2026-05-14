<script lang="ts">
	import type { PageProps } from './$types';
	import { enhance } from '$app/forms';
	import SvelteSeo from 'svelte-seo';
	import Title from '$lib/components/Title.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { User, Shield, Ban, CircleCheck } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';

	let { data, form }: PageProps = $props();

	// Track in-flight submits per user so buttons show loading state
	let submitting = $state<Record<string, boolean>>({});

	$effect(() => {
		if (!form) return;
		if ('success' in form && form.success) toast.success('User updated');
		if ('error' in form && form.error) toast.error(String(form.error));
	});

	function formatDate(date: Date | string | null) {
		if (!date) return '—';
		return new Date(date).toLocaleDateString('en-GB', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}

	// Derived list — current admin always at top, sorted by createdAt otherwise
	const sortedUsers = $derived(
		[...data.users].sort((a, b) => {
			if (a.id === data.user?.id) return -1;
			if (b.id === data.user?.id) return 1;
			return new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime();
		})
	);
</script>

<SvelteSeo title="Admin — phoXiv" description="phoXiv admin panel" />

<Title title="Admin" description="Manage user roles and access." />

<div class="flex flex-col gap-4">
	{#each sortedUsers as u (u.id)}
		{@const isSelf = u.id === data.user?.id}
		{@const isAdmin = u.role === 'admin'}
		{@const isBanned = u.banned}

		<Card.Root class={isBanned ? 'opacity-60' : ''}>
			<Card.Content class="flex flex-col gap-4 sm:flex-row sm:items-center">
				<!-- Avatar + info -->
				<div class="flex min-w-0 flex-1 items-center gap-3">
					{#if u.image}
						<img src={u.image} alt={u.name} class="size-10 shrink-0 rounded-full ring-2 ring-border" />
					{:else}
						<div
							class="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted ring-2 ring-border"
						>
							<User class="size-4 text-muted-foreground" />
						</div>
					{/if}

					<div class="flex min-w-0 flex-col gap-0.5">
						<div class="flex flex-wrap items-center gap-1.5">
							<span class="truncate text-sm font-semibold text-foreground">{u.name}</span>
							{#if isSelf}
								<Badge variant="secondary" class="text-xs">You</Badge>
							{/if}
							{#if isAdmin}
								<Badge variant="default" class="text-xs">Admin</Badge>
							{/if}
							{#if isBanned}
								<Badge variant="destructive" class="text-xs">Banned</Badge>
							{/if}
						</div>
						<span class="truncate text-xs text-muted-foreground">{u.email}</span>
						<span class="text-xs text-muted-foreground">Joined {formatDate(u.createdAt)}</span>
						{#if isBanned && u.banReason}
							<span class="text-xs text-destructive">Reason: {u.banReason}</span>
						{/if}
					</div>
				</div>

				<!-- Actions — disabled for self -->
				{#if !isSelf}
					<div class="flex shrink-0 flex-wrap items-center gap-2">
						<!-- Toggle admin -->
						<form
							method="POST"
							action="?/setRole"
							use:enhance={() => {
								submitting[u.id + '_role'] = true;
								return async ({ update }) => {
									submitting[u.id + '_role'] = false;
									await update();
								};
							}}
						>
							<input type="hidden" name="userId" value={u.id} />
							<input type="hidden" name="role" value={isAdmin ? 'user' : 'admin'} />
							<Button
								type="submit"
								variant={isAdmin ? 'outline' : 'default'}
								size="sm"
								disabled={submitting[u.id + '_role']}
							>
								<Shield class="size-3.5" />
								{isAdmin ? 'Remove admin' : 'Make admin'}
							</Button>
						</form>

						<Separator orientation="vertical" class="h-6" />

						<!-- Ban / Unban -->
						{#if isBanned}
							<form
								method="POST"
								action="?/unbanUser"
								use:enhance={() => {
									submitting[u.id + '_ban'] = true;
									return async ({ update }) => {
										submitting[u.id + '_ban'] = false;
										await update();
									};
								}}
							>
								<input type="hidden" name="userId" value={u.id} />
								<Button
									type="submit"
									variant="outline"
									size="sm"
									disabled={submitting[u.id + '_ban']}
								>
									<CircleCheck class="size-3.5" />
									Unban
								</Button>
							</form>
						{:else}
							<form
								method="POST"
								action="?/banUser"
								use:enhance={() => {
									submitting[u.id + '_ban'] = true;
									return async ({ update }) => {
										submitting[u.id + '_ban'] = false;
										await update();
									};
								}}
							>
								<input type="hidden" name="userId" value={u.id} />
								<input type="hidden" name="reason" value="" />
								<Button
									type="submit"
									variant="destructive"
									size="sm"
									disabled={submitting[u.id + '_ban']}
								>
									<Ban class="size-3.5" />
									Ban
								</Button>
							</form>
						{/if}
					</div>
				{/if}
			</Card.Content>
		</Card.Root>
	{/each}

	{#if data.users.length === 0}
		<p class="py-12 text-center text-sm text-muted-foreground">No users found.</p>
	{/if}
</div>