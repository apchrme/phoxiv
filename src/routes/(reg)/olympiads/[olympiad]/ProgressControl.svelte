<script lang="ts">
	import { enhance } from '$app/forms';
	import { Popover } from 'bits-ui';
	import { Button, buttonVariants } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { Circle, CircleCheck, Trash2 } from '@lucide/svelte';
	import { cn } from '$lib/utils.js';
	import type { Pending } from '$lib/forms.svelte';
	import { formatScore, progressKey, type ProblemProgress } from '$lib/progress';

	/**
	 * The tracking control in a problem card's top-right corner: a state icon that
	 * opens a small form for recording, changing or removing a score.
	 *
	 * Rendered only for signed-in users — `ProblemCard` decides that.
	 *
	 * **A `Popover` from `bits-ui` directly, not from the vendored
	 * `$lib/components/ui/` tree**, which CLAUDE.md rule 2 puts off limits.
	 * `GlobalSearch.svelte` is the precedent for hand-styling a bits-ui primitive
	 * outside it; the classes below deliberately mirror `dropdown-menu-content`'s.
	 *
	 * Two choices here are load-bearing rather than aesthetic:
	 *
	 * - **Portalled.** `Card.Root` carries `overflow-hidden`, so content rendered
	 *   in place would be clipped by the year card it sits in.
	 * - **A popover, not a `DropdownMenu`.** bits-ui menus implement roving focus
	 *   and typeahead, both of which fight a text input. `TopicSelect` can use a
	 *   menu because it has no input to fight with.
	 */
	let {
		year,
		number,
		maxScore,
		entry,
		pending
	}: {
		/** The competition year; submitted so the action can resolve the problem. */
		year: number;
		/** The problem number, e.g. `T1`. */
		number: string;
		/**
		 * The denominator to show a score against, or `null` when no contributor has
		 * set one. Comes from the problem rather than from `entry`, because it is the
		 * same for every visitor — the server still validates against the stored
		 * value, so nothing here is trusted for anything but display.
		 */
		maxScore: number | null;
		/** Progress for this problem, or `undefined` when the user has not tracked it. */
		entry: ProblemProgress | undefined;
		/** The page's single tracker, so the buttons can disable themselves. */
		pending: Pending;
	} = $props();

	/** The entry's *existence* is completion; there is no flag on it to read. */
	const completed = $derived(entry !== undefined);
	const score = $derived(entry?.score ?? null);

	/** Namespaces this problem's entry in the page-wide `Pending` map. */
	const key = $derived(progressKey(year, number));
	const busy = $derived(pending.has(key));

	// One `<label for>` per instance — dozens of these are on the page at once.
	const uid = $props.id();

	let open = $state(false);
	/** What is in the score box. Seeded from `score`, then owned by the user. */
	let draft = $state('');

	/**
	 * Re-seeds the box whenever the popover opens *and* whenever a save lands,
	 * so what is shown is always the value the server actually stored — `8.500`
	 * comes back as `8.5`, and a removal empties the box rather than leaving a
	 * number behind that a second click would silently re-save.
	 *
	 * Runs before paint, so there is no flash of an empty input.
	 */
	$effect(() => {
		if (!open) return;
		draft = score === null ? '' : formatScore(score);
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
			// Pulled into the card's padding so the icon lines up with the problem
			// number rather than hanging below it.
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
			<!--
				The `<form>` lives inside the portalled content, so the input and the
				form travel together and no hidden mirror input is needed — unlike
				`ProblemsEditor.svelte`, whose TopicSelect renders outside its form.
				`use:enhance` resolves `?/trackProblem` against the page URL, not
				against wherever the node ended up in the DOM.
			-->
			<form
				method="POST"
				action="?/trackProblem"
				use:enhance={pending.track(() => key, {
					// The page holds `years` and `progress` in component state and merges
					// the action's canonical entry itself. Revalidating would re-run the
					// page load, which hands `+page.svelte` a fresh `data.olympiad` — and
					// that is a tracked dependency of the effect that refetches every
					// year of the olympiad and clears the search and topic filters.
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
					<!-- `type="text"` for the same reason as the maximum-score box in
					     `ProblemsEditor`: a number input whose contents the browser judges
					     invalid reads back as `''`, which here would quietly record
					     "completed, no score" instead of refusing what was typed. The
					     server refuses an out-of-range score rather than clamping it, and
					     that message is what the user should see. -->
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
						<!-- Ignores the box entirely, so "I did this one, never mind the
						     mark" cannot be blocked by whatever is sitting in it. -->
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
