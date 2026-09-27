<script lang="ts">
	import { Command, Popover } from 'bits-ui';
	import { buttonVariants } from '$lib/components/ui/button/index.js';
	import { Check, ChevronDown, Search, Trophy } from '@lucide/svelte';
	import { cn } from '$lib/utils.js';
	import OlympiadIcon from '$lib/components/OlympiadIcon.svelte';
	import { matchesOlympiadText } from '$lib/filters.js';
	import { plural } from '$lib/utils/plural';
	import type { OlympiadOption } from '$lib/types.js';

	/**
	 * The one olympiad picker: searchable, keyboard-driven, single or multiple,
	 * with a form-field or icon-only trigger.
	 *
	 * Built from bits-ui `Popover` + `Command`, hand-styled, because the vendored
	 * `ui/combobox/` makes the input the trigger, which can't be an icon button.
	 * Don't add `popover` or `command` through the shadcn CLI (CLAUDE.md rule 2).
	 *
	 * `shouldFilter={false}`: `Command`'s own filter reorders rows by score, which
	 * would break the pinned group and the fixed standing rows.
	 *
	 * The panel portals out of any surrounding `<form>`, so controls inside it
	 * submit nothing. With `name` set, the selection is mirrored into hidden
	 * inputs rendered in place, which `fieldList` reads on the server.
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
		 * Called with the new selection. For callers that pass `value`/`values`
		 * one-way, such as the admin panel, which keeps a draft separate from
		 * saved data.
		 */
		onValueChange?: (value: string | null) => void;
		onValuesChange?: (values: string[]) => void;
		/** The olympiads to list, in display order. Only `id`, `name` and `icon` are read. */
		olympiads: OlympiadOption[];
		/** Pick any number. Keeps the panel open on select and adds "Clear selection". */
		multiple?: boolean;
		/** `'field'`: full-width form control. `'icon'`: 32px square for the ⌘K row. */
		trigger?: 'field' | 'icon';
		/** When set, the selection is submitted under this name via hidden inputs. */
		name?: string;
		/** The olympiad whose page this is, if any. Listed first under its own heading. */
		currentOlympiad?: string;
		/** Render the "All olympiads" reset row. Single mode only. */
		allowAll?: boolean;
		/** Shown on a `'field'` trigger while nothing is selected. */
		placeholder?: string;
		/** The panel's accessible name, and the `'icon'` trigger's. */
		heading?: string;
		class?: string;
	} = $props();

	let open = $state(false);
	/** The panel's own query, cleared on close. Never seen by the caller. */
	let search = $state('');

	/** Looked up, so a stale id (deleted olympiad) renders as nothing selected. */
	const selected = $derived(
		value === null || value === undefined ? null : (olympiads.find((o) => o.id === value) ?? null)
	);
	const chosen = $derived(olympiads.filter((o) => values.includes(o.id)));

	const label = $derived.by(() => {
		if (!multiple) return selected?.name ?? (allowAll ? 'All olympiads' : placeholder);
		if (chosen.length === 0) return placeholder;
		if (chosen.length === 1) return chosen[0].name;
		return plural(chosen.length, 'olympiad');
	});
	const isEmpty = $derived(multiple ? chosen.length === 0 : selected === null);

	/** Filled while a selection is active, like the other icon-only filter triggers. */
	const triggerVariant = $derived(isEmpty ? 'outline' : 'default');

	/**
	 * The current page's olympiad, listed first. Pinned, not preselected: a
	 * filter that set itself from the URL would silently change search results.
	 */
	const pinned = $derived(
		currentOlympiad === undefined ? null : (olympiads.find((o) => o.id === currentOlympiad) ?? null)
	);
	const rest = $derived(pinned === null ? olympiads : olympiads.filter((o) => o.id !== pinned.id));

	const needle = $derived(search.trim().toLowerCase());
	const listed = $derived(rest.filter((o) => matchesOlympiadText(o, needle)));
	/** The standing rows are searchable too, so a query hides them. */
	const showAll = $derived(!multiple && allowAll && 'all olympiads'.includes(needle));
	const showClear = $derived(multiple && chosen.length > 0 && 'clear selection'.includes(needle));

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
		// Rebuilt from `olympiads`, not appended, so the stored order is display
		// order rather than click order.
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
	 * `dropdown-menu-item`'s classes with `data-selected` for `focus:`: `Command`
	 * keeps focus on the input and marks the highlighted row with `data-selected`.
	 */
	const ITEM =
		"relative flex cursor-default items-center gap-2.5 rounded-xl px-3 py-2 text-sm outline-hidden select-none data-selected:bg-accent data-selected:text-accent-foreground data-selected:**:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

	/** `combobox-trigger`'s classes, copied because that component can't live in a `Popover`. */
	const FIELD =
		"flex h-9 w-full items-center justify-between gap-1.5 rounded-4xl border border-input bg-input/30 px-3 py-2 text-sm whitespace-nowrap transition-colors outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-input/50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";
</script>

<!-- Rendered in place so they stay inside the caller's `<form>`; the panel is portalled out. -->
{#if name}
	{#each submitted as id (id)}
		<input type="hidden" {name} value={id} />
	{/each}
{/if}

{#snippet indicator(on: boolean)}
	{#if multiple}
		<!-- Don't colour this from `border` or `input`: in dark mode they match the
		     highlighted row's fill, so the box would vanish. -->
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
	<!-- `id:` prefix so no olympiad id can collide with the `all` and `clear` rows. -->
	<Command.Item value="id:{olympiad.id}" onSelect={() => choose(olympiad)} class={ITEM}>
		<OlympiadIcon icon={olympiad.icon} id={olympiad.id} size="sm" />
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
			<!-- A generic icon, not the olympiad's: flags and images can't invert when
			     the trigger fills. -->
			<Trophy />
			<!-- The button's accessible name. Keep it even though `title` repeats it. -->
			<span class="sr-only">{heading}: {label}</span>
		</Popover.Trigger>
	{:else}
		<Popover.Trigger class={cn(FIELD, className)} aria-label={heading}>
			<span class="flex min-w-0 items-center gap-2">
				{#if !multiple && selected !== null}
					<OlympiadIcon icon={selected.icon} id={selected.id} size="sm" />
				{:else if multiple && chosen.length === 1}
					<OlympiadIcon icon={chosen[0].icon} id={chosen[0].id} size="sm" />
				{:else}
					<Trophy class="text-muted-foreground" />
				{/if}
				<span class={cn('truncate', isEmpty && 'text-muted-foreground')}>{label}</span>
			</span>
			<ChevronDown class="text-muted-foreground" />
		</Popover.Trigger>
	{/if}

	<Popover.Portal>
		<!-- Portalled because the ⌘K dialog is `overflow-hidden` and would clip it. -->
		<Popover.Content
			align="end"
			sideOffset={4}
			class={cn(
				'z-50 max-w-[calc(100vw-2rem)] rounded-2xl bg-popover p-1 text-popover-foreground shadow-2xl ring-1 ring-foreground/5 outline-none dark:ring-foreground/10 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
				trigger === 'icon' ? 'w-72' : 'w-(--bits-popover-anchor-width) min-w-56'
			)}
		>
			<!-- `Popover.Content` focuses the input on open, so no `autofocus` is needed. -->
			<Command.Root label={heading} shouldFilter={false}>
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
							<!-- `forceMount`: a separator otherwise hides whenever there is a query. -->
							<Command.Separator forceMount class="-mx-1 my-1 h-px bg-border/50" />
						{/if}

						{#if showAll}
							<!-- Resets to `null`, which the server reads as no `?olympiad=`. -->
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
