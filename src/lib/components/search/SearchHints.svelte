<script lang="ts">
	import * as Kbd from '$lib/components/ui/kbd/index.js';
	import type { SearchMode } from '$lib/types.js';

	/**
	 * The keyboard-shortcut bar along the bottom of the search dialog.
	 *
	 * Hidden below `md`, where there is no keyboard to speak of and the space is
	 * better spent on results. That is also why the *meaning* of files mode cannot
	 * live here — the always-visible empty-query hint carries it instead.
	 */
	let { mode = 'problems' }: { mode?: SearchMode } = $props();
</script>

<div
	class="hidden items-center gap-4 border-t glass-hairline bg-white/20 px-4 py-2.5 text-xs text-muted-foreground md:flex dark:bg-white/3"
>
	<span><Kbd.Root>↑↓</Kbd.Root> navigate</span>
	<span><Kbd.Root>↵</Kbd.Root> {mode === 'files' ? 'open file' : 'go to year'}</span>
	<span><Kbd.Root>Esc</Kbd.Root> close</span>
	<!-- A fourth group wraps at 768px, so this one waits for the room. The chord is
	     a convenience either way: the toggle button is Tab-reachable. -->
	<span class="hidden lg:inline-flex lg:items-center lg:gap-1">
		<Kbd.Root>⌘</Kbd.Root><Kbd.Root>⇧</Kbd.Root><Kbd.Root>F</Kbd.Root>
		<span class="ml-1">files</span>
	</span>
	<span class="ml-auto flex gap-1">
		<Kbd.Root>⌘</Kbd.Root>
		<Kbd.Root>K</Kbd.Root>
	</span>
</div>
