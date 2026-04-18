<script lang="ts">
	import { getFlagCountryCode } from '$lib/utils/flag.js';

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
	const overrideModules = import.meta.glob(
		'/src/lib/assets/icons/olympiads/*.*',
		{ eager: true, query: '?url', import: 'default' }
	) as Record<string, string>;

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
	  0. Blank icon            → neutral placeholder
	  1. Local override image  (/src/lib/assets/icons/olympiads/<id>.*)
	  2. Flagpedia CDN SVG     (flag emoji detected)
	  3. Raw emoji <span>      (everything else, or CDN error)
-->
{#if !icon}
	<span
		class={className}
		aria-hidden="true"
		title="No icon set"
		style="display:inline;align-items:center;justify-content:center;background:var(--muted);border-radius:0.375rem;color:var(--muted-foreground);" // hi claude why is this not a tailwind class i hate you
	>
		<svg xmlns="http://www.w3.org/2000/svg" width="60%" height="60%" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<circle cx="12" cy="12" r="10" />
			<line x1="12" y1="8" x2="12" y2="12" />
			<line x1="12" y1="16" x2="12.01" y2="16" />
		</svg>
	</span>
{:else if overrideUrl}
	<img src={overrideUrl} alt={icon} class={className} />
{:else if countryCode && !imageError}
	<img
		src="https://flagcdn.com/{countryCode}.svg"
		alt={icon}
		class="rounded-md {className}"
		onerror={() => (imageError = true)}
	/>
{:else}
	<span class={className} aria-hidden="true">{icon}</span>
{/if}