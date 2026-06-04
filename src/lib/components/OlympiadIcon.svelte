<script lang="ts">
	import { getFlagCountryCode } from '$lib/utils/flag.js';
	import { CircleAlert } from '@lucide/svelte';

	let {
		icon = '',
		id,
		class: className = ''
	}: {
		/** The raw emoji / icon string. May be blank. */
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
	// Local icon overrides (build-time)
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

	// Check if the icon field itself is a URL (uploaded to R2 at runtime). It is possible for contributors to inject a custom URL through the icon emoji field, but that isn't dangerous, so I won't fix it.
	const isUrl = $derived(icon.startsWith('https://') || icon.startsWith('http://'));

	// Build-time local override (only relevant when icon is not a URL)
	const overrideUrl = $derived(!isUrl && id ? (iconOverrides[id] ?? null) : null);

	// Flag emoji (only relevant when not a URL and no local override)
	const countryCode = $derived(isUrl || overrideUrl ? null : getFlagCountryCode(icon));

	// Per-instance error state for the Flagpedia CDN fallback.
	let imageError = $state(false);

	$effect(() => {
		icon;
		imageError = false;
	});
</script>

<!--
	Priority order:
	  1. URL icon (uploaded to R2 at runtime — stored as full URL in the icon column)
	  2. Local override image  (/src/lib/assets/icons/olympiads/<id>.*)
	  3. Flagpedia CDN SVG     (flag emoji detected)
	  4. Raw emoji <span>      (everything else, or CDN error)
	  5. Blank / fallback
-->
{#if isUrl}
	<img src={icon} alt={id ?? 'olympiad icon'} class={className} />
{:else if overrideUrl}
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
	<CircleAlert class="h-auto" />
{/if}