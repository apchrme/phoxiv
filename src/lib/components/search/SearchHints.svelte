<script lang="ts">
	import * as Kbd from '$lib/components/ui/kbd/index.js';

	/**
	 * The keyboard-shortcut bar along the bottom of the search dialog.
	 *
	 * Hidden below `md`, where there is no keyboard to speak of and the space is
	 * better spent on results.
	 */
</script>

<div
	class="hidden items-center gap-4 border-t glass-hairline bg-white/20 px-4 py-2.5 text-xs text-muted-foreground md:flex dark:bg-white/3"
>
	<span><Kbd.Root>↑↓</Kbd.Root> navigate</span>
	<span><Kbd.Root>↵</Kbd.Root> go to year</span>
	<span><Kbd.Root>Esc</Kbd.Root> close</span>
	<span class="ml-auto flex gap-1">
		<Kbd.Root>⌘</Kbd.Root>
		<Kbd.Root>K</Kbd.Root>
	</span>
</div>
