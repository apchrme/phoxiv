<script lang="ts">
	import { Command, Popover } from 'bits-ui';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import { Check, Search, Trophy } from '@lucide/svelte';
	import { cn } from '$lib/utils.js';
	import OlympiadIcon from '$lib/components/OlympiadIcon.svelte';
	import type { OlympiadEntry } from '$lib/types.js';

	/**
	 * Deep search's olympiad filter: `All olympiads`, or exactly one of them.
	 *
	 * An icon-only trigger, exactly as `StatusFilter` and `TopicSelect` have — so
	 * the ⌘K input row reads as one family of controls rather than three unrelated
	 * ones, and so the row still fits a phone. A labelled button or a segmented
	 * `ToggleGroup` would be wrong here for the reason `StatusFilter`'s own header
	 * records: every label sits in the row at once in that form, which is most of a
	 * phone's width for a control sharing its row with the mode toggle and the
	 * close button.
	 *
	 * # Why the panel is a combobox and not a menu
	 *
	 * This started as `StatusFilter`'s whole shape — a `DropdownMenu.RadioGroup`
	 * behind that trigger — and the trigger is the half worth keeping. The menu
	 * half does not survive the list it has to hold: `StatusFilter` picks from
	 * three options and `TopicSelect` from a fixed handful, but the olympiads are
	 * ~22 today and gain one every time somebody adds a contest, so the menu was
	 * already a scrolling column of near-identical rows. **People reach for this
	 * filter knowing exactly which olympiad they want** — that is the premise of
	 * the whole feature, that they remember the contest and not the year — so
	 * typing three letters beats hunting a name, and the gap only widens as the
	 * archive does.
	 *
	 * It is `Popover` + `Command` from bits-ui, hand-styled here rather than
	 * assembled from `$lib/components/ui/`. Two reasons, and the second is the real
	 * one:
	 *
	 * - The vendored `ui/combobox/` is the bits-ui `Combobox` primitive, whose
	 *   content anchors to `Combobox.Input` — the input *is* the trigger, as
	 *   `SelectYearForm` uses it. That is right for a form field and wrong for a
	 *   32px square sharing a row with three other controls.
	 * - `GlobalSearch.svelte` is this codebase's precedent for hand-styling a
	 *   bits-ui primitive where no vendored component fits, and neither `popover`
	 *   nor `command` is vendored. Adding them means the shadcn CLI, which CLAUDE.md
	 *   rule 2 keeps away from `ui/`. The classes below are `dropdown-menu-content`'s
	 *   and `dropdown-menu-item`'s, copied so this panel matches the two menus it
	 *   shares a row with.
	 *
	 * `Command` earns its place beyond the text box: it owns the arrow keys, Enter,
	 * and the whole `role="combobox"` / `role="option"` / `aria-activedescendant`
	 * contract — the machinery [search.md](../../../../docs/search.md) records as
	 * deliberately *not* implemented for the results list itself.
	 *
	 * # Why this one is *not* in `$lib/components/`
	 *
	 * `TopicSelect` and `StatusFilter` live there because the olympiad page's
	 * toolbar and the ⌘K dialog both render them, and duplicating either would
	 * give one filter two chances to disagree with itself. This filter has exactly
	 * one caller and can have no second: an olympiad page is *already* scoped to
	 * one olympiad. Colocated beside its consumer, then, the same rule route-only
	 * components follow.
	 *
	 * A single select rather than a multi-select, matching what the server
	 * accepts: `?olympiad=` scopes the ranking pass with one url range, and a set
	 * of olympiads would be a set of ranges — a different query with a different
	 * cost, for a question ("either IPhO or EuPhO") nobody has asked.
	 */
	let {
		value = $bindable(null),
		olympiads,
		currentOlympiad
	}: {
		/** The filtered olympiad's id, or `null` for all of them. */
		value?: string | null;
		/**
		 * Every olympiad, from `/api/olympiads`. Only `id`, `name` and `icon` are
		 * read, but the whole entry is taken so the caller can hand over what it
		 * fetched without mapping it first.
		 */
		olympiads: OlympiadEntry[];
		/**
		 * The olympiad whose page the dialog was opened on, if it was opened on one.
		 * Listed first, under its own heading — see `pinned`.
		 */
		currentOlympiad?: string;
	} = $props();

	let open = $state(false);
	/**
	 * The panel's own query, cleared on close so the list is whole again next time.
	 * Nothing outside this component ever sees it: it narrows the *panel*, never
	 * the search — `value` is the only thing that leaves.
	 */
	let search = $state('');

	/**
	 * Resolved rather than assumed: `value` is set from a list that arrives over
	 * the network, so a stale id — one whose olympiad was deleted between the
	 * fetch and now — must render as "All olympiads" rather than as a blank
	 * trigger. It cannot happen through this panel, only through a `value` set
	 * elsewhere.
	 */
	const current = $derived(value === null ? null : (olympiads.find((o) => o.id === value) ?? null));
	const label = $derived(current?.name ?? 'All olympiads');

	/**
	 * Filled while a filter is active, exactly as `StatusFilter` and
	 * `TopicSelect`'s icon-only trigger are. With no text on the button the fill
	 * is the only thing saying the list is being narrowed.
	 */
	const triggerVariant = $derived(current === null ? 'outline' : 'default');

	/**
	 * The olympiad the reader is already looking at, hoisted to the top of the
	 * panel under its own heading.
	 *
	 * Opening ⌘K on `/olympiads/ipho` to search inside IPhO's files is the
	 * commonest thing this filter is for, and the one case where the reader has
	 * already told us the answer. Hoisted, not **preselected**: a filter that set
	 * itself from the URL would silently change what a query returns, with the
	 * trigger's fill as the only clue — precisely the "a filter that is set but
	 * invisible" failure `GlobalSearch` goes to some trouble to avoid.
	 *
	 * Resolved against `olympiads` for `current`'s reason, and dropped from the
	 * main list below so it appears exactly once.
	 */
	const pinned = $derived(
		currentOlympiad === undefined ? null : (olympiads.find((o) => o.id === currentOlympiad) ?? null)
	);
	const rest = $derived(pinned === null ? olympiads : olympiads.filter((o) => o.id !== pinned.id));

	/**
	 * `Command` is told `shouldFilter={false}` and this filters instead, for one
	 * reason: its own filter *reorders* rows by score, which would undo both
	 * `pinned` and the deliberate position of the reset row. A plain substring test
	 * also keeps the two ways of naming an olympiad — `ipho`, and "International
	 * Physics Olympiad" — equally good, where a fuzzy score would rank one above
	 * the other for no reason a reader could predict.
	 *
	 * `Command` still owns everything else it is here for: the keyboard, the
	 * highlight, and resetting that highlight to the first row whenever this list
	 * changes.
	 */
	const needle = $derived(search.trim().toLowerCase());
	function matches(olympiad: OlympiadEntry): boolean {
		return (
			needle === '' ||
			olympiad.name.toLowerCase().includes(needle) ||
			olympiad.id.toLowerCase().includes(needle)
		);
	}
	const listed = $derived(rest.filter((o) => matches(o)));
	/** The reset row is searchable too, so typing `ipho` does not leave it sitting there. */
	const showAll = $derived('all olympiads'.includes(needle));

	function choose(id: string | null) {
		value = id;
		open = false;
	}

	/**
	 * `dropdown-menu-item`'s classes, with `data-selected` where it has `focus:`.
	 * `Command` keeps DOM focus on the input and marks the highlighted row with
	 * `data-selected`, so a `focus:` variant would never fire here.
	 */
	const ITEM =
		"relative flex cursor-default items-center gap-2.5 rounded-xl px-3 py-2 text-sm outline-hidden select-none data-selected:bg-accent data-selected:text-accent-foreground data-selected:**:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";
</script>

{#snippet row(olympiad: OlympiadEntry)}
	<!-- `id:` prefixes the command value so no olympiad can collide with the reset
	     row's `all`, whatever `createOlympiad` slugified its id to. That value is
	     `Command`'s identity for the row and never reaches the server. -->
	<Command.Item value="id:{olympiad.id}" onSelect={() => choose(olympiad.id)} class={ITEM}>
		<!-- The real icon here, the way `StatusFilter`'s items carry
		     `ProgressControl`'s circles: in the panel there is a label beside it and
		     no fill to invert against. -->
		<OlympiadIcon icon={olympiad.icon} id={olympiad.id} class="size-4 shrink-0" />
		<span class="flex-1 truncate">{olympiad.name}</span>
		{#if value === olympiad.id}
			<Check class="text-muted-foreground" />
		{/if}
	</Command.Item>
{/snippet}

<Popover.Root
	bind:open
	onOpenChange={(isOpen) => {
		if (!isOpen) search = '';
	}}
>
	<Popover.Trigger
		class={cn(buttonVariants({ variant: triggerVariant, size: 'icon-sm' }), 'shrink-0')}
		title="Filter by olympiad: {label}"
	>
		<!-- A generic `Trophy` and not the filtered olympiad's own icon: those are
		     flags and uploaded images, which cannot invert to
		     `text-primary-foreground` when the trigger fills, and several are
		     indistinguishable from one another at 16px. Uncoloured for that same
		     inheritance, as `StatusFilter`'s is. -->
		<Trophy />
		<!-- The button's accessible name, since nothing visible spells it. Both
		     halves earn their place: the purpose, which the icon cannot say, and the
		     current option, which is otherwise unreachable while the panel is shut. -->
		<span class="sr-only">Filter by olympiad: {label}</span>
	</Popover.Trigger>

	<Popover.Portal>
		<!-- Portalled for `DropdownMenu.Content`'s reason: `Dialog.Content` is
		     `overflow-hidden`, so a panel rendered in place would be clipped by the
		     input row it hangs from. A fixed `w-64` rather than the anchor's width,
		     which is 32px here. -->
		<Popover.Content
			align="end"
			sideOffset={4}
			class="z-50 w-72 max-w-[calc(100vw-2rem)] rounded-2xl bg-popover p-1 text-popover-foreground shadow-2xl ring-1 ring-foreground/5 outline-none dark:ring-foreground/10 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95"
		>
			<!-- `Popover.Content` traps focus and focuses its first focusable child on
			     open, which is the input below — so the panel is typable the moment it
			     appears, with no `autofocus` and no timer. It is also what keeps the ⌘K
			     dialog's own arrow keys out of the way for free: that handler bails
			     unless the event target is the *dialog's* input. -->
			<Command.Root label="Filter by olympiad" shouldFilter={false}>
				<!-- Full-bleed hairline under the box, so the query and the list it
				     narrows read as two things. `-mx-1` cancels the panel's `p-1`; the
				     `px-4` that replaces it lands the text on the same left edge as an
				     item's `px-3`, and the magnifier is the dialog's own. -->
				<div class="-mx-1 mb-1 flex items-center gap-2 border-b border-border/50 px-4 py-2.5">
					<Search class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
					<Command.Input
						bind:value={search}
						placeholder="Search olympiads…"
						autocomplete="off"
						autocapitalize="off"
						spellcheck="false"
						class="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
					/>
				</div>
				<Command.List class="max-h-64 overflow-y-auto">
					<Command.Viewport>
						<Command.Empty class="px-3 py-6 text-center text-sm text-muted-foreground">
							No olympiad matches that.
						</Command.Empty>

						{#if pinned !== null && matches(pinned)}
							<Command.Group value="on-this-page">
								<Command.GroupHeading class="px-3 py-2 text-xs text-muted-foreground">
									On this page
								</Command.GroupHeading>
								<Command.GroupItems>
									{@render row(pinned)}
								</Command.GroupItems>
							</Command.Group>
							<!-- `forceMount`, because a `Command.Separator` hides itself as soon as
							     there is a query — and the group above it, rendered by the `{#if}`,
							     does not. -->
							<Command.Separator forceMount class="-mx-1 my-1 h-px bg-border/50" />
						{/if}

						{#if showAll}
							<!-- The reset row, below `pinned` and above the rest. `null` is what
							     the server means by an absent `?olympiad=`; nothing here spells it
							     as a string. -->
							<Command.Item value="all" onSelect={() => choose(null)} class={ITEM}>
								<Trophy class="text-muted-foreground" />
								<span class="flex-1 truncate">All olympiads</span>
								{#if value === null}
									<Check class="text-muted-foreground" />
								{/if}
							</Command.Item>
						{/if}

						{#each listed as olympiad (olympiad.id)}
							{@render row(olympiad)}
						{/each}
					</Command.Viewport>
				</Command.List>
			</Command.Root>
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>
