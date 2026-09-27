<script lang="ts">
	import { getFlagCountryCode } from '$lib/utils/flag.js';
	import { isIconUrl } from '$lib/uploads.js';
	import { CircleAlert } from '@lucide/svelte';
	import { cn } from '$lib/utils.js';

	/**
	 * Each size sets the image height and the emoji fallback's font size together.
	 * Don't use `size-*`: fixing both axes squashes a flag's aspect ratio.
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
		/** Merged after the size, so it can override it. */
		class?: string;
	} = $props();

	const classes = $derived(cn('shrink-0', SIZES[size], className));

	// Local icon overrides, { olympiadId → asset url }, resolved at build time so
	// Vite fingerprints them.
	const overrideModules = import.meta.glob('/src/lib/assets/icons/olympiads/*.*', {
		eager: true,
		query: '?url',
		import: 'default'
	}) as Record<string, string>;

	const iconOverrides: Record<string, string> = {};
	for (const [path, url] of Object.entries(overrideModules)) {
		// '/src/lib/assets/icons/olympiads/ipho.svg' → 'ipho'
		const filename = path.split('/').pop() ?? '';
		const contestId = filename.replace(/\.[^.]+$/, '');
		iconOverrides[contestId] = url;
	}

	// An uploaded icon is stored as a URL. Contributors can also type a URL into
	// the emoji field; that is harmless, so it is allowed.
	const isUrl = $derived(isIconUrl(icon));

	const overrideUrl = $derived(!isUrl && id ? (iconOverrides[id] ?? null) : null);

	const countryCode = $derived(isUrl || overrideUrl ? null : getFlagCountryCode(icon));

	// Set when the flag CDN fails; falls back to the raw emoji.
	let imageError = $state(false);

	// Retry loading when the icon changes.
	$effect(() => {
		const _icon = icon; // tracked dependency
		imageError = false;
	});
</script>

<!--
	Priority: uploaded URL, local override, flag CDN (for flag emoji), raw emoji,
	then a fallback icon.
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
