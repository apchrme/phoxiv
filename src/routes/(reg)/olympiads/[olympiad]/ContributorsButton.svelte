<script lang="ts">
	import { resolve } from '$app/paths';
	import { Popover } from 'bits-ui';
	import { buttonVariants } from '#lib/components/ui/button/index.js';
	import Skeleton from '#lib/components/ui/skeleton/skeleton.svelte';
	import EmptyState from '#lib/components/EmptyState.svelte';
	import UserAvatar from '#lib/components/UserAvatar.svelte';
	import { ArrowRight, TriangleAlert, UserRound, Users } from '@lucide/svelte';
	import { cn } from '#lib/utils.js';
	import { plural } from '#lib/utils/plural.js';
	import { Resource } from '#lib/resource.svelte.js';
	import type { Contributor } from '#lib/types.js';

	/**
	 * Who uploaded this olympiad's files, most uploads first, in a popover beside
	 * the back link.
	 *
	 * Fetched from the shared-cached `/api/olympiads/[olympiad]/contributors` on
	 * first open, not in the page load, so a visit that never opens it costs
	 * nothing. Uses bits-ui `Popover` directly (CLAUDE.md rule 2).
	 */
	let { olympiadId }: { olympiadId: string } = $props();

	// The page reuses this component when navigating between olympiads, so the
	// resource is keyed by id: a stale list must never show under another name.
	const source = $derived(new Resource<Contributor[]>(`/api/olympiads/${olympiadId}/contributors`));
</script>

<Popover.Root onOpenChange={(open) => open && void source.loadOnce()}>
	<Popover.Trigger class={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
		<Users data-icon="inline-start" />
		Contributors
	</Popover.Trigger>

	<Popover.Portal>
		<Popover.Content
			align="end"
			sideOffset={6}
			class="z-50 flex max-h-96 w-72 flex-col rounded-2xl bg-popover p-3 text-popover-foreground shadow-2xl ring-1 ring-foreground/5 duration-100 outline-none dark:ring-foreground/10 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
		>
			<p class="m-0 mb-2 px-1 text-xs font-medium text-muted-foreground">Uploaded files</p>

			{#if source.loading}
				<div class="flex flex-col gap-2" aria-busy="true">
					{#each { length: 3 }, i (i)}
						<Skeleton class="h-8 w-full" />
					{/each}
				</div>
			{:else if source.failed}
				<EmptyState
					variant="error"
					icon={TriangleAlert}
					message="Couldn't load the contributors"
					boxed={false}
					class="py-4"
				/>
			{:else if source.value && source.value.length > 0}
				<ol class="m-0 flex list-none flex-col gap-1 overflow-y-auto p-0">
					{#each source.value as person, i (i)}
						<li class="flex items-center gap-2.5 rounded-lg px-1 py-1">
							<UserAvatar user={person} class="size-7 ring-1 ring-border" iconClass="size-3.5" />
							<span class="min-w-0 flex-1 truncate text-sm font-medium">{person.name}</span>
							<span class="shrink-0 text-xs text-muted-foreground tabular-nums">
								{plural(person.uploads, 'file')}
							</span>
						</li>
					{/each}
				</ol>
			{:else}
				<EmptyState icon={UserRound} message="No credited uploads yet" boxed={false} class="py-4" />
			{/if}

			<a
				href={resolve('team')}
				class="mt-2 inline-flex items-center gap-1 self-end px-1 text-xs font-medium text-muted-foreground hover:text-primary"
			>
				Meet the team <ArrowRight class="size-3" />
			</a>
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>
