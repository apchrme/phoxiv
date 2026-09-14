<script lang="ts">
	import { Command, Popover } from 'bits-ui';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import { Check, ChevronDown, Search, Trophy } from '@lucide/svelte';
	import { cn } from '$lib/utils.js';
	import OlympiadIcon from '$lib/components/OlympiadIcon.svelte';
	import { matchesOlympiadText } from '$lib/filters.js';
	import type { OlympiadOption } from '$lib/types.js';

	/**
	 * The one way to pick an olympiad: searchable, keyboard-driven, with icons and
	 * an empty state.
	 *
	 * Three places in the app ask the same question — "which olympiad?" — and until
	 * this component each answered it differently. Deep search's filter had search
	 * and icons; the contribute page's year picker had search and no icons; the
	 * admin panel's assignment control had an unsearchable column of ~22 native
	 * checkboxes that grows every time somebody adds a contest. All three list the
	 * same rows out of the same table, so the differences were accidents of when
	 * each was written rather than decisions.
	 *
	 * # Why `Popover` + `Command`, hand-styled
	 *
	 * The vendored `ui/combobox/` is the bits-ui `Combobox` primitive, whose
	 * content anchors to `Combobox.Input` — the input *is* the trigger. That is
	 * right for a form field and impossible for a 32px square sharing a row with
	 * three other controls. `Popover` + `Command` puts the search box *inside* the
	 * panel instead, which is what lets one component wear both trigger shapes.
	 *
	 * Neither `popover` nor `command` is vendored, and adding them means the shadcn
	 * CLI, which CLAUDE.md rule 2 keeps away from `ui/`. So they are hand-styled
	 * here, exactly as `GlobalSearch` and `ProgressControl` hand-style theirs. The
	 * panel's classes are `dropdown-menu-content`'s and `dropdown-menu-item`'s and
	 * the field trigger's are `combobox-trigger`'s, copied so this matches both the
	 * menus it shares a row with and the inputs it sits among.
	 *
	 * `Command` earns its place well beyond the text box: it owns the arrow keys,
	 * Enter, and the whole `role="combobox"` / `role="option"` /
	 * `aria-activedescendant` contract — the machinery
	 * [search.md](../../../docs/search.md) records as deliberately *not*
	 * implemented for the ⌘K results list itself.
	 *
	 * # Why the list is filtered here and not by `Command`
	 *
	 * `shouldFilter={false}`, with {@link matchesOlympiadText} doing the work. Two
	 * reasons. `Command`'s own filter *reorders* rows by score, which would undo
	 * both the pinned group and the deliberate position of the standing rows; and a
	 * fuzzy score would rank one of the two ways of naming an olympiad — `ipho`,
	 * and "International Physics Olympiad" — above the other for no reason a reader
	 * could predict. `Command` still owns everything else it is here for: the
	 * keyboard, the highlight, and resetting that highlight to the first row
	 * whenever this list changes.
	 *
	 * # The hidden inputs render in place
	 *
	 * `Popover.Content` portals to `document.body`, so nothing inside the panel is
	 * a form control of the `<form>` this component was written into — a trap the
	 * admin panel hit once with real checkboxes, which silently submitted nothing.
	 * When `name` is set the selection is mirrored into hidden inputs rendered
	 * *here*, at the component's own position in the tree, which is inside the
	 * form. Repeated `name`s are exactly what `fieldList` reads on the server.
	 */
	let {
		value = $bindable(null),
		values = $bindable([]),
		onValueChange,
		onValuesChange,
		olympiads,
		multiple = false,
		trigger = 'field',
		name,
		currentOlympiad,
		allowAll = false,
		placeholder = 'Select an olympiad…',
		heading = 'Olympiad',
		class: className
	}: {
		/** Single mode: the chosen olympiad's id, or `null` for none. */
		value?: string | null;
		/** Multiple mode: the chosen olympiads' ids. */
		values?: string[];
		/**
		 * Called with the new selection whenever the user changes it.
		 *
		 * Alongside the `$bindable`s rather than instead of them, because the admin
		 * panel needs one-way `values={…} onValuesChange={…}`: it holds a *draft*
		 * distinct from the saved server data, so its Save button can tell whether
		 * anything has been edited at all. A `$bindable` prop passed one-way is
		 * legal, and the callback is how such a caller hears about changes.
		 */
		onValueChange?: (value: string | null) => void;
		onValuesChange?: (values: string[]) => void;
		/**
		 * The olympiads to list, in the order they should appear. Only `id`, `name`
		 * and `icon` are read, so a caller holding whole `OlympiadEntry`s can hand
		 * over what it fetched without mapping it first.
		 */
		olympiads: OlympiadOption[];
		/**
		 * Pick any number rather than exactly one. Changes the indicator, keeps the
		 * panel open on select, and adds a "Clear selection" row.
		 */
		multiple?: boolean;
		/**
		 * `'field'` is a full-width form control wearing the app's input language.
		 * `'icon'` is the 32px square the ⌘K input row has space for — see the
		 * `Trophy` below.
		 */
		trigger?: 'field' | 'icon';
		/** When set, the selection is submitted under this name. See the header. */
		name?: string;
		/**
		 * The olympiad whose page the picker was opened on, if any. Listed first,
		 * under its own heading — see {@link pinned}.
		 */
		currentOlympiad?: string;
		/**
		 * Render the "All olympiads" reset row. Single mode only; in multiple mode
		 * "Clear selection" already says it.
		 */
		allowAll?: boolean;
		/** Shown on a `'field'` trigger while nothing is selected. */
		placeholder?: string;
		/** The panel's accessible name, and the `'icon'` trigger's. */
		heading?: string;
		class?: string;
	} = $props();

	let open = $state(false);
	/**
	 * The panel's own query, cleared on close so the list is whole again next time.
	 * Nothing outside this component ever sees it: it narrows the *panel*, never
	 * anything the caller reads.
	 */
	let search = $state('');

	/**
	 * Resolved rather than assumed: a selection can be set from a list that arrived
	 * over the network, so a stale id — one whose olympiad was deleted since — has
	 * to render as "nothing selected" rather than as a blank trigger.
	 */
	const selected = $derived(
		value === null || value === undefined ? null : (olympiads.find((o) => o.id === value) ?? null)
	);
	const chosen = $derived(olympiads.filter((o) => values.includes(o.id)));

	/** What a `'field'` trigger says, and what an `'icon'` trigger's title says. */
	const label = $derived.by(() => {
		if (!multiple) return selected?.name ?? (allowAll ? 'All olympiads' : placeholder);
		if (chosen.length === 0) return placeholder;
		if (chosen.length === 1) return chosen[0].name;
		return `${chosen.length} olympiads`;
	});
	const isEmpty = $derived(multiple ? chosen.length === 0 : selected === null);

	/**
	 * Filled while a selection is narrowing something, exactly as `StatusFilter`
	 * and `TopicSelect`'s icon-only triggers are. With no text on the button the
	 * fill is the only thing saying the list is being narrowed.
	 */
	const triggerVariant = $derived(isEmpty ? 'outline' : 'default');

	/**
	 * The olympiad the reader is already looking at, hoisted to the top of the
	 * panel under its own heading.
	 *
	 * Opening ⌘K on `/olympiads/ipho` to search inside IPhO's files is the
	 * commonest thing the filter is for, and the one case where the reader has
	 * already told us the answer. Hoisted, not **preselected**: a filter that set
	 * itself from the URL would silently change what a query returns, with the
	 * trigger's fill as the only clue — precisely the "a filter that is set but
	 * invisible" failure `GlobalSearch` goes to some trouble to avoid.
	 *
	 * Resolved against `olympiads` for {@link selected}'s reason, and dropped from
	 * the main list below so it appears exactly once.
	 */
	const pinned = $derived(
		currentOlympiad === undefined ? null : (olympiads.find((o) => o.id === currentOlympiad) ?? null)
	);
	const rest = $derived(pinned === null ? olympiads : olympiads.filter((o) => o.id !== pinned.id));

	const needle = $derived(search.trim().toLowerCase());
	const listed = $derived(rest.filter((o) => matchesOlympiadText(o, needle)));
	/** The standing rows are searchable too, so typing `ipho` does not leave them sitting there. */
	const showAll = $derived(!multiple && allowAll && 'all olympiads'.includes(needle));
	const showClear = $derived(multiple && chosen.length > 0 && 'clear selection'.includes(needle));

	/** What the hidden inputs submit. One id in single mode, any number in multiple. */
	const submitted = $derived(multiple ? values : value === null ? [] : [value]);

	function isSelected(olympiad: OlympiadOption): boolean {
		return multiple ? values.includes(olympiad.id) : value === olympiad.id;
	}

	function choose(olympiad: OlympiadOption) {
		if (!multiple) {
			value = olympiad.id;
			onValueChange?.(olympiad.id);
			open = false;
			return;
		}
		// Rebuilt from `olympiads` rather than appended to, so the submitted order is
		// the table's display order and not the order the admin happened to click in
		// — two admins assigning the same set then store the same thing.
		const next = values.includes(olympiad.id)
			? values.filter((id) => id !== olympiad.id)
			: olympiads.filter((o) => o.id === olympiad.id || values.includes(o.id)).map((o) => o.id);
		values = next;
		onValuesChange?.(next);
	}

	function reset() {
		if (multiple) {
			values = [];
			onValuesChange?.([]);
			return;
		}
		value = null;
		onValueChange?.(null);
		open = false;
	}

	/**
	 * `dropdown-menu-item`'s classes, with `data-selected` where it has `focus:`.
	 * `Command` keeps DOM focus on the input and marks the highlighted row with
	 * `data-selected`, so a `focus:` variant would never fire here.
	 */
	const ITEM =
		"relative flex cursor-default items-center gap-2.5 rounded-xl px-3 py-2 text-sm outline-hidden select-none data-selected:bg-accent data-selected:text-accent-foreground data-selected:**:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

	/**
	 * `combobox-trigger`'s classes, minus its `data-[slot=combobox-value]` rules
	 * and widened to fill its column. Copied rather than imported because that file
	 * is a `Combobox.Trigger` and cannot live inside a `Popover`.
	 */
	const FIELD =
		"flex h-9 w-full items-center justify-between gap-1.5 rounded-4xl border border-input bg-input/30 px-3 py-2 text-sm whitespace-nowrap transition-colors outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-input/50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";
</script>

<!-- Rendered here, at the component's own position, and so inside the caller's
     `<form>` — everything in the panel below is portalled out of it. -->
{#if name}
	{#each submitted as id (id)}
		<input type="hidden" {name} value={id} />
	{/each}
{/if}

{#snippet indicator(on: boolean)}
	{#if multiple}
		<!-- Drawn rather than a native checkbox, and coloured from `primary` and
		     `muted-foreground` rather than from `border` or `input`: those both map to
		     Surface 1 in Mocha, the same fill `data-selected:bg-accent` gives the
		     highlighted row, so a bordered square would vanish in dark mode at exactly
		     the moment the user is looking at it. -->
		<span
			class={cn(
				'flex size-4 shrink-0 items-center justify-center rounded-[6px] border transition-colors',
				on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/50'
			)}
		>
			{#if on}
				<Check class="size-3" />
			{/if}
		</span>
	{:else if on}
		<Check class="text-muted-foreground" />
	{/if}
{/snippet}

{#snippet row(olympiad: OlympiadOption)}
	<!-- `id:` prefixes the command value so no olympiad can collide with the
	     standing rows' `all` and `clear`, whatever `createOlympiad` slugified its id
	     to. That value is `Command`'s identity for the row and never reaches the
	     server. -->
	<Command.Item value="id:{olympiad.id}" onSelect={() => choose(olympiad)} class={ITEM}>
		<!-- The real icon here, the way `StatusFilter`'s items carry
		     `ProgressControl`'s circles: in the panel there is a label beside it and no
		     fill to invert against. -->
		<OlympiadIcon icon={olympiad.icon} id={olympiad.id} class="size-4 shrink-0" />
		<span class="flex-1 truncate">{olympiad.name}</span>
		{@render indicator(isSelected(olympiad))}
	</Command.Item>
{/snippet}

<Popover.Root
	bind:open
	onOpenChange={(isOpen) => {
		if (!isOpen) search = '';
	}}
>
	{#if trigger === 'icon'}
		<Popover.Trigger
			class={cn(
				buttonVariants({ variant: triggerVariant, size: 'icon-sm' }),
				'shrink-0',
				className
			)}
			title="{heading}: {label}"
		>
			<!-- A generic `Trophy` and not the selected olympiad's own icon: those are
			     flags and uploaded images, which cannot invert to
			     `text-primary-foreground` when the trigger fills, and several are
			     indistinguishable from one another at 16px. Uncoloured for that same
			     inheritance, as `StatusFilter`'s is. -->
			<Trophy />
			<!-- The button's accessible name, since nothing visible spells it. Both
			     halves earn their place: the purpose, which the icon cannot say, and the
			     current selection, which is otherwise unreachable while the panel is
			     shut. -->
			<span class="sr-only">{heading}: {label}</span>
		</Popover.Trigger>
	{:else}
		<Popover.Trigger class={cn(FIELD, className)} aria-label={heading}>
			<span class="flex min-w-0 items-center gap-2">
				{#if !multiple && selected !== null}
					<OlympiadIcon icon={selected.icon} id={selected.id} class="size-4 shrink-0" />
				{:else if multiple && chosen.length === 1}
					<OlympiadIcon icon={chosen[0].icon} id={chosen[0].id} class="size-4 shrink-0" />
				{:else}
					<Trophy class="text-muted-foreground" />
				{/if}
				<span class={cn('truncate', isEmpty && 'text-muted-foreground')}>{label}</span>
			</span>
			<ChevronDown class="text-muted-foreground" />
		</Popover.Trigger>
	{/if}

	<Popover.Portal>
		<!-- Portalled for `DropdownMenu.Content`'s reason: the ⌘K `Dialog.Content` is
		     `overflow-hidden`, so a panel rendered in place would be clipped by the
		     input row it hangs from. A `'field'` trigger's panel matches the field's
		     width; a 32px square's cannot, so that one is fixed. -->
		<Popover.Content
			align="end"
			sideOffset={4}
			class={cn(
				'z-50 max-w-[calc(100vw-2rem)] rounded-2xl bg-popover p-1 text-popover-foreground shadow-2xl ring-1 ring-foreground/5 outline-none dark:ring-foreground/10 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
				trigger === 'icon' ? 'w-72' : 'w-(--bits-popover-anchor-width) min-w-56'
			)}
		>
			<!-- `Popover.Content` traps focus and focuses its first focusable child on
			     open, which is the input below — so the panel is typable the moment it
			     appears, with no `autofocus` and no timer. It is also what keeps the ⌘K
			     dialog's own arrow keys out of the way for free: that handler bails
			     unless the event target is the *dialog's* input. -->
			<Command.Root label={heading} shouldFilter={false}>
				<!-- Full-bleed hairline under the box, so the query and the list it
				     narrows read as two things. `-mx-1` cancels the panel's `p-1`; the
				     `px-4` that replaces it lands the text on the same left edge as an
				     item's `px-3`, and the magnifier is the ⌘K dialog's own. -->
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

						{#if pinned !== null && matchesOlympiadText(pinned, needle)}
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
							<!-- The reset row, below `pinned` and above the rest. `null` is what the
							     server means by an absent `?olympiad=`; nothing here spells it as a
							     string. -->
							<Command.Item value="all" onSelect={reset} class={ITEM}>
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

						{#if showClear}
							<!-- Below the list, not above it: unlike the single-mode reset row this is
							     an action on a selection that already exists, and it appears only once
							     there is one — the affordance `TopicSelect` has and the admin panel's
							     checkbox column never did. -->
							<Command.Separator forceMount class="-mx-1 my-1 h-px bg-border/50" />
							<Command.Item value="clear" onSelect={reset} class={ITEM}>
								<span class="flex-1 truncate text-muted-foreground">Clear selection</span>
							</Command.Item>
						{/if}
					</Command.Viewport>
				</Command.List>
			</Command.Root>
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>
