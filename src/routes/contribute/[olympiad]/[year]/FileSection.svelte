<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Pending } from '$lib/forms.svelte';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import Field from '$lib/components/forms/Field.svelte';
	import SubmitButton from '$lib/components/forms/SubmitButton.svelte';
	import ConfirmSubmit from '$lib/components/forms/ConfirmSubmit.svelte';
	import { ExternalLink, Trash2 } from '@lucide/svelte';
	import { cn } from '$lib/utils.js';
	import { collidingLabel, DOCUMENT_UPLOAD, slugifyLabel } from '$lib/uploads';
	import { plural } from '$lib/utils/plural';
	import type { Extraction } from '$lib/pdf-text';

	/**
	 * The files of one owner (the year, or one problem): delete buttons and an
	 * upload form.
	 *
	 * Labels must be unique after slugging, since the slug is an R2 key segment.
	 * The server rejects collisions; this warns first. Both use `collidingLabel`.
	 *
	 * PDF text is extracted here, in the browser, on file pick. See
	 * docs/search.md, "The parser runs in the contributor's browser".
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
		/** The page's single `Pending`, so the buttons can disable themselves. */
		pending: Pending;
	} = $props();

	let label = $state('');

	// Several sections share the page, so field ids must be per-instance.
	const uid = $props.id();

	/**
	 * This section's key in the shared `Pending` map. Prefixed, so a problem
	 * numbered `year` can't clash with the year-level section.
	 */
	const key = $derived(scope === 'problem' ? `problem:${problemNumber}` : 'year');
	/** The existing label this one would overwrite, or `null`. May differ from what was typed. */
	const collision = $derived.by(() => {
		const trimmed = label.trim();
		// Unsluggable labels are reported separately; they'd match every empty slug.
		if (!trimmed || !slugifyLabel(trimmed)) return null;
		return collidingLabel(
			existingFiles.map((f) => f.label),
			trimmed
		);
	});

	/** Punctuation only: the key would be a bare extension. The server refuses it. */
	const isUnsluggable = $derived(label.trim().length > 0 && !slugifyLabel(label.trim()));
	const isInvalid = $derived(collision !== null || isUnsluggable);

	/** Shared by the field and the submit guard. */
	function labelError(): string | null {
		if (isUnsluggable) return 'Label must include a letter or number.';
		if (collision === null) return null;
		return collision === label.trim()
			? `A file named "${collision}" already exists. Delete it first or choose a different name.`
			: `"${label.trim()}" and the existing "${collision}" would be stored as the same file. Rename one of them.`;
	}

	// ── Extraction ────────────────────────────────────────────────────────────

	/**
	 * The picked file's extraction result. Runs on pick, not submit, so a scanned
	 * PDF can be swapped before upload and the parse overlaps typing the label.
	 */
	let extracted = $state<Extraction | null>(null);
	let extracting = $state(false);

	/** Stops a slow parse from reporting over a newer pick. */
	let pickToken = 0;

	async function onFilePicked(e: Event & { currentTarget: HTMLInputElement }) {
		const file = e.currentTarget.files?.[0];
		const token = ++pickToken;
		extracted = null;
		if (!file) {
			extracting = false;
			return;
		}

		// Dynamic import, so pdf.js loads only when a file is picked. A failure
		// still uploads, leaving a `pending` row for the backfill.
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
	 * Empty unless extraction succeeded. The server stores a blank as `pending`
	 * ("not indexed yet"), not as an empty index entry.
	 */
	const extractedText = $derived(extracted?.status === 'ok' ? extracted.text : '');

	/**
	 * A friendly sentence, plus the parser's raw error on failure. Don't drop
	 * `detail`: it's often the only clue to the actual fault.
	 */
	type ExtractionNote = { tone: 'muted' | 'warn' | 'ok'; text: string; detail?: string };

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
		const pages = plural(extracted.pages, 'page');
		return {
			tone: 'ok',
			text: `${pages}, ${extracted.chars} characters — searchable${
				extracted.truncated ? ' (text was very long and has been trimmed)' : ''
			}`
		};
	});

	/** Badge for an uploaded file. None for `ok`, the common case. */
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
							use:enhance={pending.track(() => `${key}/${file.label}`, { reset: true })}
						>
							<input type="hidden" name="scope" value={scope} />
							<input type="hidden" name="label" value={file.label} />
							{#if problemNumber}
								<input type="hidden" name="problemNumber" value={problemNumber} />
							{/if}
							<ConfirmSubmit
								{pending}
								key={`${key}/${file.label}`}
								size="icon-sm"
								icon={Trash2}
								title={`Delete "${file.label}"?`}
								description="The file is permanently removed from storage and from the archive. This cannot be undone."
								confirmLabel="Delete file"
							>
								<span class="sr-only">Delete {file.label}</span>
							</ConfirmSubmit>
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
			// Props are lazy getters, so this sees the current `existingFiles`.
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
			<!-- Client-submitted, so `putFileText` re-normalises and size-gates it. -->
			<input type="hidden" name="extractedText" value={extractedText} />
			<Field label="Label" for="{uid}-label" class="flex-1">
				<!-- No slashes: the label is an R2 key segment. -->
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
			</Field>
			<Field label="File" for="{uid}-file" class="flex-1">
				<input
					id="{uid}-file"
					type="file"
					name="file"
					accept={DOCUMENT_UPLOAD.accept}
					required
					onchange={onFilePicked}
					class="file-input"
				/>
			</Field>
			<SubmitButton {pending} {key} busyLabel="Uploading…" disabled={isInvalid} class="shrink-0">
				Upload
			</SubmitButton>
		</div>
		{#if extractionNote}
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
					<span class="ml-1 font-mono text-muted-foreground">{extractionNote.detail}</span>
				{/if}
			</p>
		{/if}
	</form>
</div>
