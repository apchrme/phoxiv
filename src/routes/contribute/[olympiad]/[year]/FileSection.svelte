<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Pending } from '$lib/forms.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { ExternalLink, Trash2 } from '@lucide/svelte';
	import { cn } from '$lib/utils.js';
	import { collidingLabel, DOCUMENT_UPLOAD, slugifyLabel } from '$lib/uploads';

	/**
	 * The files attached to one owner — the year as a whole, or a single problem —
	 * with a delete button each and a form to add another.
	 *
	 * Labels have to be unique within an owner *after slugging*, because the slug
	 * becomes a path segment in the R2 key and two labels can slug to one key. The
	 * server rejects a collision outright; the checks below are the friendly half,
	 * which flag it before the upload happens. Both sides call `collidingLabel`, so
	 * they cannot disagree about what collides.
	 */
	let {
		scope,
		existingFiles,
		problemNumber,
		pending
	}: {
		scope: 'year' | 'problem';
		existingFiles: { label: string; url: string }[];
		/** Required when `scope` is `'problem'`; identifies which one. */
		problemNumber?: string;
		/** The page's single tracker, so the buttons can disable themselves. */
		pending: Pending;
	} = $props();

	let label = $state('');

	// Several of these sections are on the page at once, so the field ids have to
	// be per-instance or every `<label for>` would point at the first section's
	// input.
	const uid = $props.id();

	/**
	 * Namespaces this section's entries in the shared `Pending` map.
	 *
	 * Prefixed by scope rather than falling back to a bare `'year'`: problem
	 * numbers are near-free text — only `/` is refused — so a problem numbered
	 * literally `year` would otherwise share a key with the year-level section and
	 * the two would disable each other's buttons.
	 */
	const key = $derived(scope === 'problem' ? `problem:${problemNumber}` : 'year');
	/**
	 * The label of the existing file this one would overwrite, or `null`.
	 *
	 * Often *not* the string the contributor typed: `Solutions (official)` collides
	 * with an existing `Solutions official`, so the message below names both.
	 */
	const collision = $derived.by(() => {
		const trimmed = label.trim();
		// An unsluggable label is reported on its own account below; left to
		// `collidingLabel` it would match every other empty slug.
		if (!trimmed || !slugifyLabel(trimmed)) return null;
		return collidingLabel(
			existingFiles.map((f) => f.label),
			trimmed
		);
	});

	/** Punctuation only: the key would be a bare extension. The server refuses it. */
	const isUnsluggable = $derived(label.trim().length > 0 && !slugifyLabel(label.trim()));
	const isInvalid = $derived(collision !== null || isUnsluggable);

	/** Shared by the field and the submit guard, so the two always say the same thing. */
	function labelError(): string | null {
		if (isUnsluggable) return 'Label must include a letter or number.';
		if (collision === null) return null;
		return collision === label.trim()
			? `A file named "${collision}" already exists. Delete it first or choose a different name.`
			: `"${label.trim()}" and the existing "${collision}" would be stored as the same file. Rename one of them.`;
	}
</script>

<div class="flex flex-col gap-3">
	<!-- Existing files -->
	{#if existingFiles.length > 0}
		<div class="flex flex-col gap-2">
			{#each existingFiles as file (file.label)}
				<div
					class="flex flex-col items-center gap-2 rounded-xl border border-border bg-muted/30 p-3 sm:flex-row"
				>
					<span class="flex-1 text-sm font-medium">{file.label}</span>
					<div class="flex flex-row">
						<!-- eslint-disable svelte/no-navigation-without-resolve -- absolute CDN url -->
						<a
							href={file.url}
							target="_blank"
							class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
						>
							<ExternalLink class="size-3" /> View
						</a>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
						<form
							method="POST"
							action="?/deleteFile"
							use:enhance={pending.track(() => `${key}/${file.label}`, {
								reset: true,
								confirm: `Delete "${file.label}"? This will permanently remove the file. This cannot be undone.`
							})}
						>
							<input type="hidden" name="scope" value={scope} />
							<input type="hidden" name="label" value={file.label} />
							{#if problemNumber}
								<input type="hidden" name="problemNumber" value={problemNumber} />
							{/if}
							<Button
								type="submit"
								variant="ghost"
								size="icon-sm"
								disabled={pending.has(`${key}/${file.label}`)}
							>
								<Trash2 class="size-3.5 text-destructive" />
							</Button>
						</form>
					</div>
				</div>
			{/each}
		</div>
		<Separator />
	{/if}

	<!-- Add new file form -->
	<form
		method="POST"
		action="?/uploadFile"
		enctype="multipart/form-data"
		use:enhance={pending.track(() => key, {
			reset: true,
			// `existingFiles` is a prop, and props are lazy getters — this closure
			// is captured once when the form mounts but still sees the list as it
			// stands when the guard actually runs, including files added since.
			guard: () => labelError(),
			onDone: () => (label = '')
		})}
		class="flex flex-col gap-2 sm:flex-row sm:items-end"
	>
		<input type="hidden" name="scope" value={scope} />
		{#if problemNumber}
			<input type="hidden" name="problemNumber" value={problemNumber} />
		{/if}
		<div class="flex flex-1 flex-col gap-1.5">
			<label for="{uid}-label" class="text-xs font-medium text-muted-foreground">Label</label>
			<!-- The pattern forbids forward slashes: the label becomes a path segment
			     in the R2 key, so a slash would silently nest the object. -->
			<input
				id="{uid}-label"
				name="label"
				type="text"
				bind:value={label}
				placeholder="e.g. Problems, Solutions, Marking Scheme…"
				required
				pattern="[^\/]*"
				aria-invalid={isInvalid}
				class={cn(
					'h-9 w-full rounded-4xl border border-input bg-input/30 px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
					isInvalid && 'border-destructive focus-visible:ring-destructive/20'
				)}
			/>
			{#if isInvalid}
				<p class="text-xs text-destructive">{labelError()}</p>
			{/if}
		</div>
		<div class="flex flex-1 flex-col gap-1.5">
			<label for="{uid}-file" class="text-xs font-medium text-muted-foreground">File</label>
			<input
				id="{uid}-file"
				type="file"
				name="file"
				accept={DOCUMENT_UPLOAD.accept}
				required
				class="file-input"
			/>
		</div>
		<Button type="submit" disabled={pending.has(key) || isInvalid} class="shrink-0">
			{#if pending.has(key)}
				<Spinner class="size-3.5" />
				Uploading…
			{:else}
				Upload
			{/if}
		</Button>
	</form>
</div>
