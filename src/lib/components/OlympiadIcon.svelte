<script lang="ts">
	import { getFlagCountryCode } from '$lib/utils/flag.js';
	import { isIconUrl } from '$lib/uploads.js';
	import { CircleAlert } from '@lucide/svelte';
	import { cn } from '$lib/utils.js';

	/**
	 * The four sizes this is actually rendered at, named.
	 *
	 * Eight call sites had spelled out seven slightly different recipes for the same
	 * handful of sizes, because each had to set the image's height *and* the font
	 * size the emoji fallback renders at — two numbers that must agree, with nothing
	 * keeping them in step. `size-4` appeared as well, which fixes *both* axes and
	 * so squashes a flag's aspect ratio; every size here sets a height and lets the
	 * width follow.
	 *
	 * `shrink-0` is in the base rather than per size: five of the eight passed it,
	 * and an icon that shrinks to nothing inside a flex row is never what was
	 * wanted.
	 */
	const SIZES = {
		xs: 'h-3.5 w-auto text-sm leading-none',
		sm: 'h-4 w-auto text-base leading-none',
		md: 'h-7 w-auto text-3xl leading-none',
		lg: 'h-9 w-auto text-4xl leading-none'
	} as const;

	let {
		icon = '',
		id,
		size = 'md',
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
		size?: keyof typeof SIZES;
		/** Merged after the size, so it stays the escape hatch for the odd case. */
		class?: string;
	} = $props();

	const classes = $derived(cn('shrink-0', SIZES[size], className));

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
	const isUrl = $derived(isIconUrl(icon));

	// Build-time local override (only relevant when icon is not a URL)
	const overrideUrl = $derived(!isUrl && id ? (iconOverrides[id] ?? null) : null);

	// Flag emoji (only relevant when not a URL and no local override)
	const countryCode = $derived(isUrl || overrideUrl ? null : getFlagCountryCode(icon));

	// Per-instance error state for the Flagpedia CDN fallback.
	let imageError = $state(false);

	// A new icon deserves a fresh attempt at loading it.
	$effect(() => {
		const _icon = icon; // tracked dependency
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
	<img src={icon} alt={id ?? 'olympiad icon'} class={classes} />
{:else if overrideUrl}
	<img src={overrideUrl} alt={icon} class={classes} />
{:else if countryCode && !imageError}
	<img
		src="https://flagcdn.com/{countryCode}.svg"
		alt={icon}
		class={cn('rounded-md', classes)}
		onerror={() => (imageError = true)}
	/>
{:else if icon}
	<span class={classes} aria-hidden="true">{icon}</span>
{:else}
	<CircleAlert class="h-auto" />
{/if}
