<script lang="ts">
	import { getFlagCountryCode } from '$lib/utils/flag.js';
	import { CircleAlert } from '@lucide/svelte';

	let {
		icon = '',
		id,
		class: className = ''
	}: {
		/** The raw emoji / icon string stored in the olympiad's index.yaml. May be blank. */
		icon?: string;
		/**
		 * Optional olympiad ID (e.g. "ipho", "eupho").
		 * When provided, a file at /src/lib/assets/icons/olympiads/<id>.<ext> will be
		 * used instead of the flag CDN or raw emoji, if one exists.
		 */
		id?: string;
		class?: string;
	} = $props();

	// -------------------------------------------------------------------------
	// Local icon overrides
	// Build a map of { olympiadId → resolvedAssetUrl } at module-evaluation time
	// so Vite can include them in the asset pipeline and fingerprint them.
	// -------------------------------------------------------------------------
	const overrideModules = import.meta.glob('/src/lib/assets/icons/olympiads/*.*', {
		eager: true,
		query: '?url',
		import: 'default'
	}) as Record<string, string>;

	const iconOverrides: Record<string, string> = {};
	for (const [path, url] of Object.entries(overrideModules)) {
		// '/src/lib/icons/olympiads/ipho.svg' → 'ipho'
		const filename = path.split('/').pop() ?? '';
		const contestId = filename.replace(/\.[^.]+$/, '');
		iconOverrides[contestId] = url;
	}

	// -------------------------------------------------------------------------
	// Derived values
	// -------------------------------------------------------------------------
	const overrideUrl = $derived(id ? (iconOverrides[id] ?? null) : null);
	const countryCode = $derived(overrideUrl ? null : getFlagCountryCode(icon));

	// Per-instance error state for the Flagpedia CDN fallback.
	let imageError = $state(false);

	$effect(() => {
		icon;
		imageError = false;
	});
</script>

<!--
	Priority order:
	  1. Local override image  (/src/lib/assets/icons/olympiads/<id>.*)
	  2. Flagpedia CDN SVG     (flag emoji detected)
	  3. Raw emoji <span>      (everything else, or CDN error)
	  4. Blank
-->
{#if overrideUrl}
	<img src={overrideUrl} alt={icon} class={className} />
{:else if countryCode && !imageError}
	<img
		src="https://flagcdn.com/{countryCode}.svg"
		alt={icon}
		class="rounded-md {className}"
		onerror={() => (imageError = true)}
	/>
{:else if icon}
	<span class={className} aria-hidden="true">{icon}</span>
{:else}
	<span class={className} aria-hidden="true" title="No icon set">
		<CircleAlert class="size-9" />
	</span>
{/if}
