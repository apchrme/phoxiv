<script lang="ts">
	import { contests } from '$lib/pregen/contests';
</script>

{#each contests as contest (contest.id)}
	<div class="my-3">
		<a href="/contests/{contest.id}">
			<div
				class="flex flex-row items-center gap-x-0.5 rounded-(--radius) px-3 py-4 transition sm:gap-x-4 sm:px-6 inset-ring-foreground/10 inset-ring-1 hover:inset-ring-2 bg-card text-card-foreground hover:bg-muted"
			>
				<h3 class="hidden shrink-0 basis-23 translate-y-[1pt] text-center text-5xl sm:block">
					{contest.icon}
				</h3>
				<div class="flex w-full flex-col gap-y-1">
					<div class="flex flex-row items-center">
						<h3 class="inline shrink-0 basis-13 text-center text-2xl sm:hidden">
							{contest.icon}
						</h3>
						<h3 class="inline py-0">{contest.name}</h3>
					</div>
					<span class="px-3 sm:p-0"> {contest.summary} </span>
				</div>
			</div>
		</a>
	</div>
{/each}
