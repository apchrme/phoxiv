<script lang="ts">
	import { contests } from '$lib/pregen/contests';
</script>

{#each contests as contest (contest.id)}
	<div class="my-3">
		<a href="/contests/{contest.id}">
			<div
				class="flex flex-row items-center gap-x-0.5 rounded-2xl bg-ctp-crust inset-ring inset-ring-ctp-lavender-900/20 dark:inset-ring-ctp-lavender/20 hover:inset-ring-2 px-3 py-3 transition hover:bg-ctp-surface1 sm:gap-x-4 sm:px-6 dark:bg-ctp-surface0"
			>
				<h3 class="hidden shrink-0 basis-23 translate-y-1.5 text-center text-5xl sm:block">
					{contest.icon}
				</h3>
				<div class="flex w-full flex-col">
					<div class="flex flex-row items-center">
						<h3 class="inline shrink-0 basis-13 translate-y-[1pt] text-center text-2xl sm:hidden">
							{contest.icon}
						</h3>
						<h3 class="inline">{contest.name}</h3>
					</div>
					<span class="px-3 text-ctp-subtext1 sm:p-0"> {contest.summary} </span>
				</div>
			</div>
		</a>
	</div>
{/each}
