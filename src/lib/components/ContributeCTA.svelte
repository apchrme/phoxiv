<script lang="ts">
	import { ArrowRight } from '@lucide/svelte';
	import { buttonVariants } from '#lib/components/ui/button/index.js';
	import { cn } from '#lib/utils.js';
</script>

<!-- Contribute CTA: a primary banner with a secondary button -->
<section class="mt-2 mb-6">
	<div
		class="flex flex-col items-center justify-between gap-4 rounded-2xl bg-primary px-5 py-4 shadow-sm sm:flex-row"
	>
		<p class="mb-0 text-center text-sm font-medium text-primary-foreground sm:text-left">
			Want to add problems or new olympiads? Drop me an email!
		</p>
		<a
			href="mailto:apochrome@proton.me"
			class={cn(buttonVariants({ variant: 'secondary' }), 'shrink-0 rounded-xl font-semibold')}
		>
			Get in touch <ArrowRight class="size-4" />
		</a>
	</div>
</section>
