<script lang="ts">
	import { ICON_UPLOAD } from '$lib/uploads';
	import { cn } from '$lib/utils.js';

	/**
	 * A file input for olympiad icons with a preview. Owns the preview's object
	 * URL and revokes it on change and unmount. Parents can call `clear()` via
	 * `bind:this`.
	 */
	let {
		id = 'iconFile',
		name = 'iconFile',
		required = false,
		class: className,
		previewClass = 'h-9 w-auto rounded-md border border-border object-contain',
		/** Set false when the parent renders its own, larger preview. */
		showPreview = true,
		/** Called on selection change. Display `previewUrl` but don't keep it: it gets revoked. */
		onchange
	}: {
		id?: string;
		name?: string;
		required?: boolean;
		class?: string;
		previewClass?: string;
		showPreview?: boolean;
		onchange?: (file: File | null, previewUrl: string | null) => void;
	} = $props();

	let input: HTMLInputElement | undefined = $state();
	let previewUrl = $state<string | null>(null);

	/** Discards the selection, revoking the preview URL. */
	export function clear() {
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		previewUrl = null;
		if (input) input.value = '';
		onchange?.(null, null);
	}

	function onFileChange(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0] ?? null;
		if (previewUrl) URL.revokeObjectURL(previewUrl);
		previewUrl = file ? URL.createObjectURL(file) : null;
		onchange?.(file, previewUrl);
	}

	// Releases the URL if the component unmounts with a file still selected.
	$effect(() => () => {
		if (previewUrl) URL.revokeObjectURL(previewUrl);
	});
</script>

<div class="flex items-center gap-3">
	<input
		bind:this={input}
		{id}
		{name}
		{required}
		type="file"
		accept={ICON_UPLOAD.accept}
		onchange={onFileChange}
		class={cn('file-input', className)}
	/>
	{#if previewUrl && showPreview}
		<img src={previewUrl} alt="Icon preview" class={previewClass} />
	{/if}
</div>
