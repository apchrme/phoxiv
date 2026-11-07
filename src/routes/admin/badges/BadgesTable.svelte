<script lang="ts">
	import { resolve } from '$app/paths';
	import AwardIcon from '@lucide/svelte/icons/award';
	import EyeOffIcon from '@lucide/svelte/icons/eye-off';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import { Button } from '#lib/components/ui/button/index.js';
	import EmptyState from '#lib/components/EmptyState.svelte';
	import BadgeMedal from '#lib/components/BadgeMedal.svelte';
	import { describeBadge } from '#lib/badges.js';
	import { plural } from '#lib/utils/plural.js';
	import type { PageData } from './$types';

	/**
	 * The badges list: every badge, most holders first as on `/badges`, with its
	 * criteria (hidden ones too) and holder count. Editing happens on
	 * `/admin/badges/[id]`, which is also where a badge is deleted, so this list
	 * has no forms of its own.
	 */
	let {
		badges,
		olympiads
	}: {
		badges: PageData['badges'];
		olympiads: PageData['olympiads'];
	} = $props();

	const olympiadNames = $derived(Object.fromEntries(olympiads.map((o) => [o.id, o.name])));
</script>

<div class="flex flex-col gap-3">
	<div class="flex items-center justify-between gap-2">
		<p class="m-0 text-sm text-muted-foreground">
			Holder counts are exact here; the public badges page can lag up to a day.
		</p>
		<Button size="sm" href={resolve('admin/badges/new')}>
			<PlusIcon />
			New badge
		</Button>
	</div>

	{#if badges.length === 0}
		<EmptyState
			icon={AwardIcon}
			message="No badges yet"
			hint="Create one, and everyone whose progress already qualifies gets it."
		/>
	{:else}
		<ul aria-label="Badges" class="m-0 flex list-none flex-col gap-2 p-0">
			{#each badges as badge (badge.id)}
				<li
					class="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-card-foreground"
				>
					<BadgeMedal icon={badge.icon} color={badge.color} size="sm" />
					<div class="flex min-w-0 flex-1 flex-col">
						<span class="truncate font-medium">{badge.name}</span>
						<span class="flex items-center gap-1 text-xs text-muted-foreground">
							{#if badge.requirementHidden}
								<EyeOffIcon class="size-3.5 shrink-0" aria-hidden="true" />
								<span class="sr-only">Hidden from users:</span>
							{/if}
							<span class="truncate">{describeBadge(badge, olympiadNames)}</span>
						</span>
					</div>
					<span class="shrink-0 text-sm text-muted-foreground tabular-nums">
						{plural(badge.holders, 'holder')}
					</span>
					<Button
						variant="outline"
						size="sm"
						href={resolve(`admin/badges/${badge.id}`)}
						aria-label="Edit {badge.name}"
					>
						<PencilIcon />
						Edit
					</Button>
				</li>
			{/each}
		</ul>
	{/if}
</div>
