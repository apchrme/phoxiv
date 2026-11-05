<script lang="ts">
	import { authClient } from '#lib/auth-client.js';
	import { AUTH_PROVIDERS, signInErrorMessage, type AuthProviderId } from '#lib/auth-providers.js';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import logo from '#lib/assets/branding/logo.svg';
	import ProviderMark from '#lib/components/ProviderMark.svelte';
	import { CircleAlert } from '@lucide/svelte';
	import SvelteSeo from 'svelte-seo';

	/** The provider whose redirect is in flight; every button waits on it. */
	let pending = $state<AuthProviderId | null>(null);

	// Read ?redirect= from the URL so we can forward after sign-in
	const redirectTo = $derived(page.url.searchParams.get('redirect') ?? resolve('/'));

	// A failed sign-in comes back here with ?error=<code> (see `errorCallbackURL`).
	const errorCode = $derived(page.url.searchParams.get('error'));

	/**
	 * Where BetterAuth sends a failed sign-in: this page, keeping `?redirect=`, so
	 * the visitor sees why and can retry. Without it they land on BetterAuth's
	 * bare `/api/auth/error` page, which is how a refused account link looks.
	 */
	const errorCallbackURL = $derived.by(() => {
		const redirect = page.url.searchParams.get('redirect');
		const query = redirect ? `?${new URLSearchParams({ redirect })}` : '';
		return `${resolve('login')}${query}`;
	});

	async function signIn(provider: AuthProviderId) {
		pending = provider;
		try {
			await authClient.signIn.social({ provider, callbackURL: redirectTo, errorCallbackURL });
		} finally {
			pending = null;
		}
	}
</script>

<SvelteSeo title="Sign in — phoXiv" description="Sign in to phoXiv." />

<div class="flex min-h-[calc(100svh-10rem)] flex-col items-center justify-center py-12">
	<div class="w-full max-w-sm">
		<!-- Logo mark -->
		<div class="mb-8 flex flex-col items-center gap-3">
			<div
				class="flex size-14 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20"
			>
				<img src={logo} class="size-7" alt="phoXiv logo" />
			</div>
			<div class="flex flex-col items-center gap-1 text-center">
				<h1 class="text-2xl font-bold tracking-tight">Sign in/Sign up</h1>
				<p class="text-sm text-muted-foreground">
					Sign in to track your progress as you do problems!
				</p>
			</div>
		</div>

		{#if errorCode}
			<div
				role="alert"
				class="mb-4 flex gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
			>
				<CircleAlert class="mt-0.5 size-4 shrink-0" />
				<p>{signInErrorMessage(errorCode)}</p>
			</div>
		{/if}

		<!-- Sign in card -->
		<div class="overflow-hidden rounded-2xl border border-border bg-card ring-1 ring-foreground/5">
			<div class="flex flex-col gap-3 p-6">
				{#each AUTH_PROVIDERS as provider (provider.id)}
					<button
						onclick={() => signIn(provider.id)}
						disabled={pending !== null}
						class="flex w-full items-center justify-center gap-2.5 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
					>
						{#if pending === provider.id}
							<span
								class="size-4 animate-spin rounded-full border-2 border-foreground/30 border-t-foreground"
							></span>
							Redirecting…
						{:else}
							<ProviderMark provider={provider.id} />
							Continue with {provider.label}
						{/if}
					</button>
				{/each}
				<p class="text-center text-xs text-muted-foreground">
					Use the same email on both and they lead to the same account.
				</p>
			</div>
		</div>
	</div>
</div>
