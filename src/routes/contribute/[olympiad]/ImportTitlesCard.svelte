<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Pending } from '$lib/forms.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { FileUp, Download, X } from '@lucide/svelte';
	import { PROBLEM_TOPICS } from '$lib/types';
	import { CSV_UPLOAD } from '$lib/uploads';

	/**
	 * Round-trips problem titles and topics through a CSV.
	 *
	 * The export link is a plain `href` with `data-sveltekit-reload`: the endpoint
	 * responds with a file download rather than a page, so the client router must
	 * not try to handle it.
	 *
	 * Import failures are left to the page's `formToasts`, which toasts every
	 * failed action — rendering them inline here as well showed the same message
	 * twice.
	 */
	let {
		olympiadId,
		pending
	}: {
		olympiadId: string;
		/** The page's single tracker, so the submit button can disable itself. */
		pending: Pending;
	} = $props();

	let fileName = $state<string | null>(null);
	let fileInput: HTMLInputElement | null = $state(null);

	/** Discards the chosen file. Called by the page once an import lands. */
	export function clear() {
		fileName = null;
		if (fileInput) fileInput.value = '';
	}

	function onFileChange(e: Event) {
		fileName = (e.currentTarget as HTMLInputElement).files?.[0]?.name ?? null;
	}
</script>

<Card.Root>
	<Card.Header class="border-b">
		<Card.Title>Import problem titles &amp; topics</Card.Title>
		<Card.Description>
			Upload a CSV with columns <code class="font-mono text-xs">year,number,title,topics</code>. New
			problems are created (missing years are added automatically); a title or topic list that is
			already set is left unchanged. The <code class="font-mono text-xs">topics</code> column is
			optional — separate multiple topics with semicolons, e.g.
			<code class="font-mono text-xs">Mechanics;Waves and Optics</code>. Allowed topics:
			{PROBLEM_TOPICS.join(', ')}.
		</Card.Description>
	</Card.Header>
	<Card.Content class="flex flex-col gap-4">
		<div class="flex items-center justify-between gap-3">
			<p class="text-sm text-muted-foreground">
				Download the current titles and topics for this olympiad to edit and re-upload.
			</p>
			<Button
				href="/contribute/{olympiadId}/titles.csv"
				variant="outline"
				size="sm"
				class="shrink-0"
				data-sveltekit-reload
			>
				<Download class="size-3.5" />
				Export titles
			</Button>
		</div>
		<Separator />
		<form
			method="POST"
			action="?/importTitles"
			enctype="multipart/form-data"
			use:enhance={pending.track('importTitles')}
			class="flex flex-col gap-3"
		>
			<Input
				id="csvFile"
				name="csvFile"
				type="file"
				accept={CSV_UPLOAD.accept}
				bind:ref={fileInput}
				onchange={onFileChange}
				class="file-input"
			/>
			<div class="flex gap-2">
				<Button type="submit" size="sm" disabled={pending.has('importTitles') || !fileName}>
					{#if pending.has('importTitles')}
						<Spinner class="size-3.5" />
						Importing…
					{:else}
						<FileUp class="size-3.5" />
						Import titles
					{/if}
				</Button>
				{#if fileName}
					<Button type="button" variant="ghost" size="sm" onclick={clear}>
						<X class="size-3.5" />
						Clear
					</Button>
				{/if}
			</div>
		</form>
	</Card.Content>
</Card.Root>
