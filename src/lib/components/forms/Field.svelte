<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils.js';

	/**
	 * One labelled control in a form: the label, an optional inline hint, and
	 * whatever the caller puts under it.
	 *
	 * The wrapper — `flex flex-col gap-1.5`, a `text-sm font-medium` label, a
	 * control — was written out eighteen times across seven files, in two different
	 * label typographies: `text-sm font-medium` in the roomy cards, and
	 * `text-xs font-medium text-muted-foreground` in the two dense inline rows.
	 * Neither was a decision; they are just what each file happened to be written
	 * with. **This settles on the `text-sm` one**, which is what the large majority
	 * of the app already used, so a label means the same thing wherever it appears.
	 *
	 * `src/app.css` draws the line this sits on: a utility class belongs in CSS
	 * when the same decoration lands on structurally different elements, and
	 * anything repeating its **markup** as well should be a component. This repeats
	 * its markup.
	 *
	 * Anything that belongs *below* the control — a size limit, a "remove the
	 * uploaded icon to use an emoji" note, a validation message — goes in
	 * `children` after the control, inside the same column. Only the label and the
	 * hint beside it are the component's business.
	 */
	let {
		label,
		for: htmlFor,
		hint,
		class: className,
		children
	}: {
		label: string;
		/**
		 * The id of the control this labels.
		 *
		 * **Omit it when there is nothing labellable to point at** — a picker or
		 * select whose trigger is a `<button>`, which `<label for>` does not apply
		 * to. A `<span>` is rendered instead of a `<label>` in that case, which is
		 * honest markup and removes the `a11y_label_has_associated_control`
		 * suppressions those call sites used to carry. Such a control should carry
		 * its own `aria-label`.
		 */
		for?: string;
		/** A short aside after the label — "(optional)", a unit, a caveat. */
		hint?: string;
		class?: string;
		children: Snippet;
	} = $props();
</script>

<div class={cn('flex flex-col gap-1.5', className)}>
	{#if htmlFor}
		<label for={htmlFor} class="text-sm font-medium">
			{label}
			{#if hint}
				<span class="ml-1 font-normal text-muted-foreground">{hint}</span>
			{/if}
		</label>
	{:else}
		<span class="text-sm font-medium">
			{label}
			{#if hint}
				<span class="ml-1 font-normal text-muted-foreground">{hint}</span>
			{/if}
		</span>
	{/if}
	{@render children()}
</div>
