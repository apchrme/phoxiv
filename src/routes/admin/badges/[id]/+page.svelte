<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import SvelteSeo from 'svelte-seo';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import BackLink from '#lib/components/BackLink.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import ConfirmSubmit from '#lib/components/forms/ConfirmSubmit.svelte';
	import * as Card from '#lib/components/ui/card/index.js';
	import { formToasts, Pending } from '#lib/forms.svelte.js';
	import { plural } from '#lib/utils/plural.js';
	import BadgeForm from './BadgeForm.svelte';
	import HoldersList from './HoldersList.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	/** The single `Pending` for the page, shared by the save and delete forms. */
	const pending = new Pending();

	let badgeForm: ReturnType<typeof BadgeForm> | undefined = $state();

	// The one `formToasts` call, on the component that owns `form`.
	formToasts(() => form, {
		save: (result) => {
			// A new badge moves to its own URL, so a second save edits it rather
			// than creating another.
			if (result.created && typeof result.id === 'number') {
				badgeForm?.allowLeave();
				void goto(resolve(`admin/badges/${result.id}`), { replaceState: true });
			}
			const holders = typeof result.holders === 'number' ? result.holders : 0;
			return `Badge saved. ${plural(holders, 'person holds', 'people hold')} it.`;
		}
	});
</script>

<SvelteSeo title="{data.badge ? `Edit ${data.badge.name}` : 'New badge'} — phoXiv" />

<BackLink href={resolve('admin/badges')}>Back to badges</BackLink>

<PageHeader
	title={data.badge ? data.badge.name : 'New badge'}
	size="sm"
	description={data.badge
		? `${plural(data.holderList.length, 'person holds', 'people hold')} this badge. Saving re-checks everyone's progress against the new criteria.`
		: 'Saving awards the badge to everyone whose progress already qualifies.'}
/>

<!-- Keyed by badge: moving from `new` to the saved badge's URL reuses this route,
     so without a remount the form would keep `allowLeave()`'s flag, and every
     later edit would leave without the unsaved-changes prompt. -->
{#key data.badge?.id}
	<div class="mx-auto flex max-w-2xl flex-col gap-5 pb-16">
		<BadgeForm bind:this={badgeForm} {data} {pending} />

		{#if data.badge}
			<HoldersList holders={data.holderList} />

			<form
				method="POST"
				action="?/delete"
				use:enhance={pending.track('delete', {
					// Only once it has gone: a refused delete stays on the page, and the
					// unsaved-changes prompt must keep working there.
					onDone: (result) => {
						if (result.type === 'redirect') badgeForm?.allowLeave();
					}
				})}
			>
				<Card.Root class="border-destructive/40">
					<Card.Header>
						<Card.Title>Delete badge</Card.Title>
						<Card.Description>
							Removes it from everyone who holds it. This can't be undone.
						</Card.Description>
					</Card.Header>
					<Card.Content>
						<ConfirmSubmit
							{pending}
							key="delete"
							icon={Trash2Icon}
							title="Delete {data.badge.name}?"
							description="{plural(
								data.holderList.length,
								'person',
								'people'
							)} will lose it. This can't be undone."
							confirmLabel="Delete badge"
						>
							Delete badge
						</ConfirmSubmit>
					</Card.Content>
				</Card.Root>
			</form>
		{/if}
	</div>
{/key}
