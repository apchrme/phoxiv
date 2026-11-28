<script lang="ts">
	import SunIcon from '@lucide/svelte/icons/sun';
	import MoonIcon from '@lucide/svelte/icons/moon';

	import { resetMode, setMode, setTheme, theme } from 'mode-watcher';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu/index.js';
	import { buttonVariants } from '#lib/components/ui/button/index.js';

	/**
	 * Palettes beside the default Catppuccin one, each a `data-theme` value that
	 * app.css defines tokens for in both modes. The default is no attribute.
	 */
	const THEMES = [
		{ value: '', label: 'Default' },
		{ value: 'christmas', label: 'Christmas' }
	] as const;
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger class={buttonVariants({ variant: 'outline', size: 'icon' })}>
		<SunIcon
			class="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-all! dark:scale-0 dark:-rotate-90"
		/>
		<MoonIcon
			class="absolute h-[1.2rem] w-[1.2rem] scale-0 rotate-90 transition-all! dark:scale-100 dark:rotate-0"
		/>
		<span class="sr-only">Toggle theme</span>
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end" class="min-w-none w-36">
		<DropdownMenu.Item onclick={() => setMode('light')}>Light</DropdownMenu.Item>
		<DropdownMenu.Item onclick={() => setMode('dark')}>Dark</DropdownMenu.Item>
		<DropdownMenu.Item onclick={() => resetMode()}>System</DropdownMenu.Item>
		<DropdownMenu.Separator />
		<DropdownMenu.Label>Palette</DropdownMenu.Label>
		<DropdownMenu.RadioGroup value={theme.current ?? ''} onValueChange={setTheme}>
			{#each THEMES as { value, label } (value)}
				<DropdownMenu.RadioItem {value}>{label}</DropdownMenu.RadioItem>
			{/each}
		</DropdownMenu.RadioGroup>
	</DropdownMenu.Content>
</DropdownMenu.Root>
