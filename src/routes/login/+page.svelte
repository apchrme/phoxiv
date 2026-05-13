<script lang="ts">
	import { authClient } from '$lib/auth-client';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { Github, Zap } from '@lucide/svelte';
	import SvelteSeo from 'svelte-seo';

	let loading = $state(false);

	// Read ?redirect= from the URL so we can forward after sign-in
	const redirectTo = $derived(page.url.searchParams.get('redirect') ?? resolve('/contribute'));

	async function signInWithGitHub() {
		loading = true;
		try {
			await authClient.signIn.social({
				provider: 'github',
				callbackURL: redirectTo
			});
		} finally {
			loading = false;
		}
	}
</script>

<SvelteSeo title="Sign in - phoXiv" description="Sign in to contribute to phoXiv." />

<div class="flex min-h-[calc(100svh-10rem)] flex-col items-center justify-center py-12">
	<div class="w-full max-w-sm">
		<!-- Logo mark -->
		<div class="mb-8 flex flex-col items-center gap-3">
			<div
				class="flex size-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20"
			>
				<Zap class="size-7 text-primary" />
			</div>
			<div class="flex flex-col items-center gap-1 text-center">
				<h1 class="text-2xl font-bold tracking-tight">Welcome back</h1>
				<p class="text-sm text-muted-foreground">
					Sign in to contribute to the phoXiv archive
				</p>
			</div>
		</div>

		<!-- Sign in card -->
		<div
			class="overflow-hidden rounded-2xl border border-border bg-card ring-1 ring-foreground/5"
		>
			<div class="flex flex-col gap-4 p-6">
				<button
					onclick={signInWithGitHub}
					disabled={loading}
					class="flex w-full items-center justify-center gap-2.5 rounded-xl border border-border bg-foreground px-4 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
				>
					{#if loading}
						<span class="size-4 animate-spin rounded-full border-2 border-background/30 border-t-background"></span>
						Redirecting…
					{:else}
						<Github class="size-4" />
						Continue with GitHub
					{/if}
				</button>
			</div>

			<div class="border-t border-border bg-muted/30 px-6 py-4">
				<p class="text-center text-xs leading-relaxed text-muted-foreground">
					Only contributors need an account. Browsing olympiad problems is open to everyone — no
					sign-in required.
				</p>
			</div>
		</div>

		<!-- Back link -->
		<p class="mt-6 text-center text-sm text-muted-foreground">
			<a href={resolve('/')} class="underline-offset-4 hover:text-foreground hover:underline">
				← Back to phoXiv
			</a>
		</p>
	</div>
</div>