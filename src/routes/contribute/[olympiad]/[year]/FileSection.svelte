<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Pending } from '$lib/forms.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { ExternalLink, Trash2 } from '@lucide/svelte';
	import { cn } from '$lib/utils.js';
	import { collidingLabel, DOCUMENT_UPLOAD, slugifyLabel } from '$lib/uploads';
	import type { Extraction } from '$lib/pdf-text';

	/**
	 * The files attached to one owner — the year as a whole, or a single problem —
	 * with a delete button each and a form to add another.
	 *
	 * Labels have to be unique within an owner *after slugging*, because the slug
	 * becomes a path segment in the R2 key and two labels can slug to one key. The
	 * server rejects a collision outright; the checks below are the friendly half,
	 * which flag it before the upload happens. Both sides call `collidingLabel`, so
	 * they cannot disagree about what collides.
	 *
	 * This is also where **text extraction happens**, in the contributor's own
	 * browser — see `$lib/pdf-text.ts` for why it is not in the Worker. The whole
	 * dividend of that placement shows up here: the form can say "no text found,
	 * this looks like a scanned PDF" while the file can still be swapped, instead
	 * of leaving an admin to notice a counter afterwards.
	 */
	let {
		scope,
		existingFiles,
		fileTextStatus,
		problemNumber,
		pending
	}: {
		scope: 'year' | 'problem';
		existingFiles: { label: string; url: string }[];
		/** Extraction status by file url. A url with no entry has not been seen. */
		fileTextStatus: Record<string, string>;
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

	// ── Extraction ────────────────────────────────────────────────────────────

	/**
	 * What the picked file's text extraction produced, or `null` before one has
	 * been picked.
	 *
	 * Extraction runs on `change`, **not on submit**, for two reasons that both
	 * matter: the contributor sees "no text found" while they can still swap the
	 * file, and a forty-page parse overlaps with them typing the label rather than
	 * blocking an upload they have already started.
	 */
	let extracted = $state<Extraction | null>(null);
	let extracting = $state(false);

	/**
	 * Guards against a slow parse landing after a newer pick.
	 *
	 * A contributor who picks a 200-page PDF and then changes their mind would
	 * otherwise see the first file's page count reported for the second.
	 */
	let pickToken = 0;

	async function onFilePicked(e: Event & { currentTarget: HTMLInputElement }) {
		const file = e.currentTarget.files?.[0];
		const token = ++pickToken;
		extracted = null;
		if (!file) {
			extracting = false;
			return;
		}

		// A dynamic import, so pdf.js is fetched the first time a contributor picks
		// a file and never on any other page. `extractText` never throws — a failure
		// is `{status: 'error'}` and the upload still goes ahead, landing a
		// `pending` row for the backfill sweep.
		extracting = true;
		try {
			const { extractText } = await import('$lib/pdf-text');
			const result = await extractText(file);
			if (token === pickToken) extracted = result;
		} catch {
			if (token === pickToken) extracted = { status: 'error', error: 'Extraction unavailable' };
		} finally {
			if (token === pickToken) extracting = false;
		}
	}

	/**
	 * The text submitted alongside the file.
	 *
	 * Empty for every non-`ok` outcome, which is exactly right: the server maps a
	 * blank field to a `pending` row for the backfill to pick up, so a browser that
	 * could not extract degrades to "not indexed yet" rather than to "indexed as
	 * nothing".
	 */
	const extractedText = $derived(extracted?.status === 'ok' ? extracted.text : '');

	/**
	 * A friendly sentence, and — on a failure only — the parser's own words.
	 *
	 * `detail` is kept apart from `text` rather than concatenated into it so the
	 * two can be styled differently: the sentence in the note's own tone, the raw
	 * message muted and monospaced, so it reads as machine output rather than as
	 * more prose. It exists at all because the error branch below used to drop
	 * `extracted.error` on the floor, which is how a `TypeError` thrown inside
	 * `extractText` reached the contributor as nothing but "couldn't read the
	 * text" — and reached the console as nothing at all. Its other half is the
	 * `console.error` in `$lib/pdf-text.ts`.
	 */
	type ExtractionNote = { tone: 'muted' | 'warn' | 'ok'; text: string; detail?: string };

	/** How the pick is described under the file input. */
	const extractionNote: ExtractionNote | null = $derived.by(() => {
		if (extracting) return { tone: 'muted', text: 'Reading text…' };
		if (!extracted) return null;
		if (extracted.status === 'skipped') {
			return { tone: 'muted', text: "This file type isn't searchable, but it will upload fine." };
		}
		if (extracted.status === 'empty') {
			return {
				tone: 'warn',
				text: 'No text found — this looks like a scanned PDF. It will upload fine, but it will not be searchable.'
			};
		}
		if (extracted.status === 'error') {
			return {
				tone: 'warn',
				text: "Couldn't read the text. The file will still upload, and indexing will be retried later.",
				detail: extracted.error
			};
		}
		const pages = extracted.pages === 1 ? '1 page' : `${extracted.pages} pages`;
		return {
			tone: 'ok',
			text: `${pages}, ${extracted.chars.toLocaleString()} characters — searchable${
				extracted.truncated ? ' (text was very long and has been trimmed)' : ''
			}`
		};
	});

	/**
	 * The badge for an already-uploaded file. `ok` gets nothing at all — the quiet
	 * state is the common one, and a row of green ticks would be noise.
	 */
	function statusBadge(url: string): string | null {
		const status = fileTextStatus[url] ?? 'pending';
		if (status === 'ok') return null;
		if (status === 'empty') return 'no text';
		if (status === 'skipped') return 'not searchable';
		if (status === 'error') return 'indexing failed';
		return 'indexing pending';
	}
</script>

<div class="flex flex-col gap-3">
	<!-- Existing files -->
	{#if existingFiles.length > 0}
		<div class="flex flex-col gap-2">
			{#each existingFiles as file (file.label)}
				{@const badge = statusBadge(file.url)}
				<div
					class="flex flex-col items-center gap-2 rounded-xl border border-border bg-muted/30 p-3 sm:flex-row"
				>
					<span class="flex-1 text-sm font-medium">
						{file.label}
						{#if badge}
							<span class="ml-2 text-xs font-normal text-muted-foreground">({badge})</span>
						{/if}
					</span>
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
			onDone: () => {
				label = '';
				extracted = null;
			}
		})}
		class="flex flex-col gap-2"
	>
		<div class="flex flex-col gap-2 sm:flex-row sm:items-end">
			<input type="hidden" name="scope" value={scope} />
			{#if problemNumber}
				<input type="hidden" name="problemNumber" value={problemNumber} />
			{/if}
			<!-- The text this browser extracted, travelling with the file it came from.
			     Empty whenever extraction did not produce usable text, which the server
			     stores as a `pending` row rather than as nothing — see `putFileText`,
			     which re-normalises and size-gates this field because it is
			     client-submitted. -->
			<input type="hidden" name="extractedText" value={extractedText} />
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
					onchange={onFilePicked}
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
		</div>
		{#if extractionNote}
			<!-- Reported before the upload, not after it: that is the whole reason the
			     parser runs in the browser. A scan can be swapped for a text PDF while
			     nothing has been stored. -->
			<p
				class={cn(
					'text-xs',
					extractionNote.tone === 'warn'
						? 'text-amber-600 dark:text-amber-500'
						: 'text-muted-foreground'
				)}
			>
				{extractionNote.text}
				{#if extractionNote.detail}
					<!-- The parser's own message, carried through rather than swallowed: it
					     is the difference between "couldn't read the text" and "The API
					     version does not match the Worker version", which names the fix. -->
					<span class="ml-1 font-mono text-muted-foreground">{extractionNote.detail}</span>
				{/if}
			</p>
		{/if}
	</form>
</div>
