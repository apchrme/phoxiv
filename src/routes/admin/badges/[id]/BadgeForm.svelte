<script lang="ts">
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { beforeNavigate } from '$app/navigation';
	import SaveIcon from '@lucide/svelte/icons/save';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import EyeOffIcon from '@lucide/svelte/icons/eye-off';
	import * as Card from '#lib/components/ui/card/index.js';
	import { Input } from '#lib/components/ui/input/index.js';
	import { Switch } from '#lib/components/ui/switch/index.js';
	import { Textarea } from '#lib/components/ui/textarea/index.js';
	import Field from '#lib/components/forms/Field.svelte';
	import SubmitButton from '#lib/components/forms/SubmitButton.svelte';
	import BadgeMedal from '#lib/components/BadgeMedal.svelte';
	import OlympiadPicker from '#lib/components/OlympiadPicker.svelte';
	import TopicSelect from '#lib/components/TopicSelect.svelte';
	import { Resource } from '#lib/resource.svelte.js';
	import type { Pending } from '#lib/forms.svelte.js';
	import { matchesTopics } from '#lib/filters.js';
	import { plural } from '#lib/utils/plural.js';
	import { cn } from '#lib/utils.js';
	import {
		BADGE_COLORS,
		BADGE_COLOR_KEYS,
		BADGE_DESCRIPTION_MAX,
		BADGE_ICON_KEYS,
		BADGE_NAME_MAX,
		describeBadge,
		type BadgeScope
	} from '#lib/badges.js';
	import type { ProblemTopic, SearchItem } from '#lib/types.js';
	import ProblemPicker from './ProblemPicker.svelte';
	import type { PageData } from './$types';

	/**
	 * The `?/save` form. Each field is a writable `$derived` of the loaded badge,
	 * so a reload of the page data after a save resets the fields to what was
	 * stored, as in the olympiad editor.
	 */
	let { data, pending }: { data: PageData; pending: Pending } = $props();

	const badge = $derived(data.badge);

	let name = $derived(badge?.name ?? '');
	let description = $derived(badge?.description ?? '');
	let icon = $derived<string>(badge?.icon ?? 'trophy');
	let color = $derived<string>(badge?.color ?? 'mauve');
	let requiredCount = $derived<string | number>(String(badge?.requiredCount ?? 1));
	let scoreMinPct = $derived<string | number>(badge?.scoreMinPct?.toString() ?? '');
	let scoreMaxPct = $derived<string | number>(badge?.scoreMaxPct?.toString() ?? '');
	let requirementHidden = $derived(badge?.requirementHidden ?? false);
	let scope = $derived<BadgeScope>(badge?.scope ?? 'all');
	let topics = $derived<ProblemTopic[]>(badge?.topics ?? []);
	let olympiadIds = $derived<string[]>(badge?.olympiadIds ?? []);
	let problems = $derived(data.manualProblems);

	/**
	 * The corpus, for the manual picker and the filter preview. Shared-cached
	 * `/api/search`, the same body the ⌘K dialog loads.
	 */
	const corpus = new Resource<SearchItem[]>('/api/search');
	onMount(() => void corpus.loadOnce());

	const SCOPES: { value: BadgeScope; label: string; hint: string }[] = [
		{ value: 'all', label: 'Every problem', hint: 'Any completed problem counts.' },
		{
			value: 'filter',
			label: 'By topic and olympiad',
			hint: 'A live rule: problems added or re-tagged later count too.'
		},
		{ value: 'manual', label: 'Hand-picked', hint: 'Only the problems you select.' }
	];

	const required = $derived(Number(requiredCount));
	const olympiadNames = $derived(Object.fromEntries(data.olympiads.map((o) => [o.id, o.name])));

	/** The criteria sentence, as `/badges` will show it. */
	const summary = $derived(
		describeBadge(
			{
				id: badge?.id ?? 0,
				requiredCount: Number.isInteger(required) && required > 0 ? required : 1,
				scoreMinPct: scoreMinPct === '' ? null : Number(scoreMinPct),
				scoreMaxPct: scoreMaxPct === '' ? null : Number(scoreMaxPct),
				scope,
				topics,
				olympiadIds
			},
			olympiadNames
		)
	);

	/**
	 * How many problems qualify right now, before scores. `null` until the corpus
	 * loads. Uses the same predicates as `qualifies`.
	 */
	const available = $derived.by(() => {
		if (scope === 'manual') return problems.length;
		if (!corpus.value) return null;
		if (scope === 'all') return corpus.value.length;
		return corpus.value.filter(
			(i) =>
				(olympiadIds.length === 0 || olympiadIds.includes(i.olympiadId)) &&
				matchesTopics(i.problem.topics, topics)
		).length;
	});

	const hasRange = $derived(scoreMinPct !== '' || scoreMaxPct !== '');

	const saved = $derived({
		name: badge?.name ?? '',
		description: badge?.description ?? '',
		icon: badge?.icon ?? 'trophy',
		color: badge?.color ?? 'mauve',
		requiredCount: String(badge?.requiredCount ?? 1),
		scoreMinPct: badge?.scoreMinPct?.toString() ?? '',
		scoreMaxPct: badge?.scoreMaxPct?.toString() ?? '',
		requirementHidden: badge?.requirementHidden ?? false,
		scope: badge?.scope ?? 'all',
		topics: JSON.stringify(badge?.topics ?? []),
		olympiadIds: JSON.stringify(badge?.olympiadIds ?? []),
		problems: JSON.stringify(data.manualProblems)
	});

	/** `String()` because number inputs write numbers back through `bind:value`. */
	const dirty = $derived(
		name !== saved.name ||
			description !== saved.description ||
			icon !== saved.icon ||
			color !== saved.color ||
			String(requiredCount) !== saved.requiredCount ||
			String(scoreMinPct) !== saved.scoreMinPct ||
			String(scoreMaxPct) !== saved.scoreMaxPct ||
			requirementHidden !== saved.requirementHidden ||
			scope !== saved.scope ||
			JSON.stringify(topics) !== saved.topics ||
			JSON.stringify(olympiadIds) !== saved.olympiadIds ||
			JSON.stringify(problems) !== saved.problems
	);

	/**
	 * Set by the page just before it navigates after a save, so a new badge's
	 * move to its own URL isn't stopped by the unsaved-changes prompt.
	 */
	let leaving = false;
	export function allowLeave() {
		leaving = true;
	}

	// Nothing is saved until "Save", so warn before leaving with edits, as the
	// olympiad editor does. A `'leave'` (reload, closing the tab) can only get the
	// browser's own prompt.
	beforeNavigate((navigation) => {
		if (leaving || !dirty) return;
		if (navigation.type === 'leave') navigation.cancel();
		else if (!confirm('You have unsaved changes to this badge. Leave without saving?')) {
			navigation.cancel();
		}
	});
</script>

<form method="POST" action="?/save" use:enhance={pending.track('save')} class="flex flex-col gap-5">
	<!-- Preview -->
	<Card.Root>
		<Card.Content class="flex items-center gap-4">
			<BadgeMedal {icon} {color} size="lg" />
			<div class="flex min-w-0 flex-col gap-0.5">
				<span class="truncate text-lg font-semibold">{name || 'Untitled badge'}</span>
				<span class="text-sm text-muted-foreground" data-testid="badge-summary">{summary}</span>
				{#if requirementHidden}
					<span class="flex items-center gap-1 text-xs text-muted-foreground">
						<EyeOffIcon class="size-3.5" /> Only admins and holders see this. Everyone else sees "Requirement
						hidden".
					</span>
				{/if}
			</div>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header class="border-b">
			<Card.Title>Badge</Card.Title>
			<Card.Description>What people see on the badges page and their dashboard.</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-4">
			<Field label="Name" for="name">
				<Input
					id="name"
					name="name"
					required
					maxlength={BADGE_NAME_MAX}
					bind:value={name}
					placeholder="e.g. Heat seeker"
				/>
			</Field>
			<Field label="Description" for="description" hint="(optional)">
				<Textarea
					id="description"
					name="description"
					rows={2}
					maxlength={BADGE_DESCRIPTION_MAX}
					bind:value={description}
					placeholder="A line of flavour text"
				/>
			</Field>

			<fieldset class="flex flex-col gap-2">
				<legend class="mb-2 text-sm font-medium">Icon</legend>
				<div class="grid grid-cols-5 gap-2 sm:grid-cols-10">
					{#each BADGE_ICON_KEYS as key (key)}
						<label
							class="flex cursor-pointer items-center justify-center rounded-lg p-1.5 ring-primary hover:bg-muted has-checked:ring-2 has-focus-visible:outline-2"
							title={key}
						>
							<input type="radio" name="icon" value={key} class="sr-only" bind:group={icon} />
							<BadgeMedal icon={key} {color} size="sm" />
							<span class="sr-only">{key}</span>
						</label>
					{/each}
				</div>
			</fieldset>

			<fieldset class="flex flex-col gap-2">
				<legend class="mb-2 text-sm font-medium">Colour</legend>
				<div class="flex flex-wrap gap-2">
					{#each BADGE_COLOR_KEYS as key (key)}
						<label
							class="flex cursor-pointer items-center gap-1.5 rounded-full border border-border py-1 pr-2.5 pl-1 text-xs hover:bg-muted has-checked:border-primary has-checked:ring-1 has-checked:ring-primary has-focus-visible:outline-2"
						>
							<input type="radio" name="color" value={key} class="sr-only" bind:group={color} />
							<span
								class={cn(
									'size-4 rounded-full',
									BADGE_COLORS[key].bg,
									'ring-2',
									BADGE_COLORS[key].ring
								)}
							></span>
							{BADGE_COLORS[key].label}
						</label>
					{/each}
				</div>
			</fieldset>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header class="border-b">
			<Card.Title>Requirement</Card.Title>
			<Card.Description>
				How many qualifying problems to complete, and optionally the score each needs.
			</Card.Description>
		</Card.Header>
		<Card.Content class="flex flex-col gap-4">
			<Field label="Problems required" for="requiredCount">
				<Input
					id="requiredCount"
					name="requiredCount"
					type="number"
					min="1"
					step="1"
					required
					bind:value={requiredCount}
				/>
			</Field>
			<div class="grid grid-cols-2 gap-4">
				<Field label="Minimum score" for="scoreMinPct" hint="(% of max, optional)">
					<Input
						id="scoreMinPct"
						name="scoreMinPct"
						type="number"
						min="0"
						max="100"
						step="any"
						bind:value={scoreMinPct}
						placeholder="0"
					/>
				</Field>
				<Field label="Maximum score" for="scoreMaxPct" hint="(% of max, optional)">
					<Input
						id="scoreMaxPct"
						name="scoreMaxPct"
						type="number"
						min="0"
						max="100"
						step="any"
						bind:value={scoreMaxPct}
						placeholder="100"
					/>
				</Field>
			</div>
			{#if hasRange}
				<p class="m-0 text-xs text-muted-foreground">
					With a score range, a completion counts only if it has a score and the problem has a max
					score.
				</p>
			{/if}
			<!-- The hint is the switch's description, not part of its label, so the
			     accessible name stays short and doesn't collide with the Name field's. -->
			<div class="flex items-start gap-3">
				<Switch
					id="requirementHidden"
					name="requirementHidden"
					class="mt-0.5"
					aria-describedby="requirementHidden-hint"
					bind:checked={requirementHidden}
				/>
				<div class="flex flex-col">
					<label for="requirementHidden" class="cursor-pointer text-sm font-medium">
						Hide the requirement
					</label>
					<span id="requirementHidden-hint" class="text-xs text-muted-foreground">
						People see the name, icon and description, but not what earns the badge or how close
						they are, until they earn it.
					</span>
				</div>
			</div>
		</Card.Content>
	</Card.Root>

	<Card.Root>
		<Card.Header class="border-b">
			<Card.Title>Which problems count</Card.Title>
		</Card.Header>
		<Card.Content class="flex flex-col gap-4">
			<fieldset class="flex flex-col gap-2">
				<legend class="sr-only">Which problems count</legend>
				{#each SCOPES as option (option.value)}
					<label
						class="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 hover:bg-muted has-checked:border-primary"
					>
						<input
							type="radio"
							name="scope"
							value={option.value}
							class="mt-1 accent-primary"
							bind:group={scope}
						/>
						<span class="flex flex-col">
							<span class="text-sm font-medium">{option.label}</span>
							<span class="text-xs text-muted-foreground">{option.hint}</span>
						</span>
					</label>
				{/each}
			</fieldset>

			{#if scope === 'filter'}
				<!-- The topic menu portals out of the form, so topics travel as JSON. -->
				<input type="hidden" name="topics" value={JSON.stringify(topics)} />
				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<Field label="Topics" hint="(any of)">
						<TopicSelect bind:value={topics} label="Any topic" class="w-full justify-between" />
					</Field>
					<Field label="Olympiads" hint="(any of)">
						<OlympiadPicker
							multiple
							name="olympiadId"
							bind:values={olympiadIds}
							olympiads={data.olympiads}
							placeholder="Any olympiad"
							heading="Olympiads"
						/>
					</Field>
				</div>
				<p class="m-0 text-xs text-muted-foreground">
					A problem must match one of the topics and one of the olympiads. Leave one empty to not
					restrict it.
				</p>
			{:else if scope === 'manual'}
				<ProblemPicker {corpus} olympiads={data.olympiads} bind:selected={problems} />
			{/if}

			{#if available !== null}
				<p class="m-0 text-sm text-muted-foreground" data-testid="badge-available">
					{plural(available, 'problem qualifies', 'problems qualify')} right now{hasRange
						? ', before scores'
						: ''}.
				</p>
				{#if Number.isInteger(required) && required > available}
					<p class="m-0 flex items-center gap-1.5 text-sm text-destructive">
						<TriangleAlertIcon class="size-4 shrink-0" />
						Nobody can earn this yet: it needs {required}.
					</p>
				{/if}
			{/if}
		</Card.Content>
	</Card.Root>

	<div class="flex justify-end">
		<SubmitButton {pending} key="save" icon={SaveIcon} busyLabel="Saving…">
			{badge ? 'Save changes' : 'Create badge'}
		</SubmitButton>
	</div>
</form>
