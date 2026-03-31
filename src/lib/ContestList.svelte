<script lang="ts">
	import { contests } from '$lib/pregen/contests';
	import * as Card from './components/ui/card/index.ts';
</script>

{#each contests as contest (contest.id)}
	<div class="mb-3">
		<a href="/contests/{contest.id}">
			<Card.Root
				class="flex flex-row items-center gap-x-0.5 px-3 py-4 transition hover:bg-muted sm:gap-x-4 sm:px-6 "
			>
				<h3 class="hidden shrink-0 basis-23 translate-y-[1pt] p-0 text-center text-5xl sm:block">
					{contest.icon}
				</h3>
				<div class="flex w-full flex-col gap-y-1">
					<div class="flex flex-row items-center">
						<h3 class="inline shrink-0 basis-13 p-0 text-center text-2xl sm:hidden">
							{contest.icon}
						</h3>
						<h3 class="inline py-0 text-card-foreground">{contest.name}</h3>
					</div>
					<span class="px-3 sm:p-0"> {contest.summary} </span>
				</div>
			</Card.Root>
		</a>
	</div>
{/each}
