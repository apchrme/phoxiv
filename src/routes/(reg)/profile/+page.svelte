<script lang="ts">
	import type { PageProps } from './$types';
	import { authClient } from '$lib/auth-client';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import * as Card from '$lib/components/ui/card/index.js';
	import SvelteSeo from 'svelte-seo';
	import { LogOut, User, Mail, Shield } from '@lucide/svelte';
	import Github from '$lib/assets/icons/Github.svelte';
	import Title from '$lib/components/Title.svelte';

	let { data }: PageProps = $props();

	const user = $derived(data.user);

	let signingOut = $state(false);

	async function signOut() {
		signingOut = true;
		try {
			await authClient.signOut();
			goto(resolve('/'), { invalidateAll: true });
		} finally {
			signingOut = false;
		}
	}

	function formatDate(date: Date | string) {
		return new Date(date).toLocaleDateString('en-GB', {
			day: 'numeric',
			month: 'long',
			year: 'numeric'
		});
	}
</script>

<SvelteSeo title="Profile — phoXiv" description="Your phoXiv profile." />

<Title title="Profile" description="Your account details and settings." />

<div class="mx-auto max-w-lg">
	<!-- Avatar + name card -->
	<Card.Root class="mb-4">
		<Card.Content class="flex flex-col items-center gap-4 py-8">
			<!-- Avatar -->
			<div class="relative">
				{#if user?.image}
					<img
						src={user.image}
						alt={user.name}
						class="size-24 rounded-full ring-4 ring-primary/20"
					/>
				{:else}
					<div
						class="flex size-24 items-center justify-center rounded-full bg-primary/10 ring-4 ring-primary/20"
					>
						<User class="size-10 text-primary/60" />
					</div>
				{/if}
				<!-- Online indicator -->
				<span
					class="absolute right-1 bottom-1 size-4 rounded-full border-2 border-card bg-green-500"
					title="Signed in"
				></span>
			</div>

			<div class="flex flex-col items-center gap-1 text-center">
				<h2 class="text-xl font-semibold text-foreground">{user?.name}</h2>
				<span class="flex items-center gap-1.5 text-sm text-muted-foreground">
					<Github class="size-3.5" />
					GitHub account
				</span>
			</div>
		</Card.Content>
	</Card.Root>

	<!-- Details card -->
	<Card.Root class="mb-4">
		<Card.Header class="border-b pb-4">
			<Card.Title>Account details</Card.Title>
		</Card.Header>
		<Card.Content class="flex flex-col divide-y divide-border">
			<div class="flex items-center gap-3 py-3.5">
				<Mail class="size-4 shrink-0 text-muted-foreground" />
				<div class="flex min-w-0 flex-1 flex-col gap-0.5">
					<span class="text-xs text-muted-foreground">Email</span>
					<span class="truncate text-sm font-medium">{user?.email}</span>
				</div>
				{#if user?.emailVerified}
					<span
						class="shrink-0 rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600 dark:text-green-400"
					>
						Verified
					</span>
				{/if}
			</div>

			<div class="flex items-center gap-3 py-3.5">
				<Shield class="size-4 shrink-0 text-muted-foreground" />
				<div class="flex min-w-0 flex-1 flex-col gap-0.5">
					<span class="text-xs text-muted-foreground">Member since</span>
					<span class="text-sm font-medium">{formatDate(user?.createdAt ?? new Date())}</span>
				</div>
			</div>
			<button
				onclick={signOut}
				disabled={signingOut}
				class="flex w-full items-center gap-3 rounded-xl py-3 text-left text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
			>
				<LogOut class="size-4 shrink-0" />
				<span class="text-sm font-medium">{signingOut ? 'Signing out…' : 'Sign out'}</span>
			</button>
		</Card.Content>
	</Card.Root>
</div>
