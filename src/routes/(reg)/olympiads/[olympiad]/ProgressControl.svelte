<script lang="ts">
	import { enhance } from '$app/forms';
	import { Popover } from 'bits-ui';
	import { Button, buttonVariants } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { Circle, CircleCheck, Trash2 } from '@lucide/svelte';
	import { cn } from '$lib/utils.js';
	import type { Pending } from '$lib/forms.svelte';
	import { exactScore, formatScore, progressKey, type ProblemProgress } from '$lib/progress';

	/**
	 * A problem card's tracking control: a state icon that opens a form to record,
	 * change or remove a score. Signed-in only; `SignInToTrack` is the signed-out
	 * version. Keep the trigger's position classes in sync with it.
	 *
	 * Uses bits-ui `Popover` directly (CLAUDE.md rule 2). Portalled, because the
	 * card is `overflow-hidden`. A popover, not a `DropdownMenu`, because menu
	 * roving focus and typeahead fight the text input.
	 */
	let {
		year,
		number,
		maxScore,
		entry,
		pending
	}: {
		year: number;
		/** The problem number, e.g. `T1`. */
		number: string;
		/** Display only, or `null` if unset. The server validates against the stored value. */
		maxScore: number | null;
		/** `undefined` when the user hasn't tracked this problem. */
		entry: ProblemProgress | undefined;
		/** The page's single `Pending`, so the buttons can disable themselves. */
		pending: Pending;
	} = $props();

	/** Completion is the entry existing; there is no flag. */
	const completed = $derived(entry !== undefined);
	const score = $derived(entry?.score ?? null);

	const key = $derived(progressKey(year, number));
	const busy = $derived(pending.has(key));

	const uid = $props.id();

	let open = $state(false);
	let draft = $state('');

	/**
	 * Re-seed the box on open and after each save, so it shows the stored value
	 * and a removal empties it. Use `exactScore`, not `formatScore`: rounding
	 * here would change the score on the next Save.
	 */
	$effect(() => {
		if (!open) return;
		draft = score === null ? '' : exactScore(score);
	});

	const triggerLabel = $derived.by(() => {
		if (!completed) return `Mark problem ${number} as done`;
		if (score === null) return `Problem ${number} — done, no score recorded`;
		const out = maxScore === null ? '' : ` out of ${formatScore(maxScore)}`;
		return `Problem ${number} — ${formatScore(score)}${out}`;
	});
</script>

<Popover.Root bind:open>
	<Popover.Trigger
		class={cn(
			buttonVariants({ variant: 'ghost', size: 'xs' }),
			// Pulled into the card's padding to line up with the problem number.
			'-mt-1 -mr-2 shrink-0 gap-1 px-1.5 font-mono tabular-nums',
			completed ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
		)}
		title={triggerLabel}
		aria-label={triggerLabel}
	>
		{#if busy}
			<Spinner class="size-4" />
		{:else if completed}
			<CircleCheck class="size-4 fill-primary/15" />
		{:else}
			<Circle class="size-4" />
		{/if}
		{#if completed && score !== null}
			<span>
				{formatScore(score)}{maxScore === null ? '' : `/${formatScore(maxScore)}`}
			</span>
		{/if}
	</Popover.Trigger>

	<Popover.Portal>
		<Popover.Content
			align="end"
			sideOffset={6}
			class="z-50 w-60 rounded-2xl bg-popover p-3 text-popover-foreground shadow-2xl ring-1 ring-foreground/5 duration-100 outline-none dark:ring-foreground/10 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
		>
			<!-- The form is inside the portal with its input, so no hidden mirror is needed. -->
			<form
				method="POST"
				action="?/trackProblem"
				use:enhance={pending.track(() => key, {
					// The page merges the result itself. Revalidating would give it a new
					// `data.olympiad`, which refetches every year and clears the filters.
					invalidateAll: false
				})}
				class="flex flex-col gap-3"
			>
				<input type="hidden" name="year" value={year} />
				<input type="hidden" name="number" value={number} />

				<div class="flex flex-col gap-1.5">
					<label for="{uid}-score" class="text-xs font-medium text-muted-foreground">
						{#if maxScore === null}
							Score for {number} (optional)
						{:else}
							Score for {number}, out of {formatScore(maxScore)}
						{/if}
					</label>
					<!-- `type="text"`: an invalid number input reads as `''`, which would
					     silently save "done, no score". The server rejects bad scores. -->
					<Input
						id="{uid}-score"
						name="score"
						type="text"
						inputmode="decimal"
						bind:value={draft}
						placeholder={maxScore === null ? 'No score' : `0 – ${formatScore(maxScore)}`}
						class="h-8"
					/>
				</div>

				<div class="flex flex-wrap items-center gap-2">
					<!-- First in document order, so pressing Enter in the box saves. -->
					<Button type="submit" name="intent" value="save" size="sm" disabled={busy}>
						{#if busy}
							<Spinner class="size-3.5" />
						{/if}
						Save
					</Button>
					{#if completed}
						<Button
							type="submit"
							name="intent"
							value="remove"
							variant="destructive"
							size="sm"
							disabled={busy}
						>
							<Trash2 class="size-3.5" />
							Remove
						</Button>
					{:else}
						<!-- Ignores the score box, so a bad value can't block it. -->
						<Button
							type="submit"
							name="intent"
							value="complete"
							variant="outline"
							size="sm"
							disabled={busy}
						>
							Mark done
						</Button>
					{/if}
				</div>
			</form>
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>
