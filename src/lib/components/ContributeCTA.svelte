<script lang="ts">
	import { ArrowRight } from '@lucide/svelte';
</script>

<!-- Contribute CTA — glass tinted banner -->
<section class="mt-2 mb-6">
	<div
		class="flex flex-col items-center justify-between gap-4 rounded-2xl border border-primary/40 bg-gradient-to-br
		       from-primary/70 to-primary/90 px-5
		       py-4 shadow-lg
		       shadow-primary/20
		       sm:flex-row"
	>
		<p class="mb-0 text-center text-sm font-medium text-primary-foreground sm:text-left">
			Want to add problems or new olympiads? Drop me an email!
		</p>
		<a
			href="mailto:apochrome@proton.me"
			class="flex shrink-0 flex-row items-center gap-1.5 rounded-xl
			       border border-white/30 bg-white/20 px-4
			       py-2 text-sm font-semibold text-primary-foreground transition-all
			       hover:gap-2.5 hover:bg-white/30"
		>
			Get in touch <ArrowRight class="size-4" />
		</a>
	</div>
</section>
