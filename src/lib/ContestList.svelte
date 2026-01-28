<script lang="ts">
	import { contests } from '../pregen/contests.js';
</script>

{#each contests as contest}
	<div class="my-3">
		<a href="/{contest.id}">
			<div
				class="bg-ctp-crust dark:bg-ctp-surface0 hover:bg-ctp-surface1 flex flex-row items-center rounded-2xl px-3 sm:px-6 gap-x-0.5 sm:gap-x-4 py-3 transition duration-300"
			>
				<h1 class="sm:block hidden basis-23 text-center shrink-0 translate-y-1.5 text-5xl">{contest.icon}</h1>
				<div class="flex flex-col w-full">
					<div class="flex flex-row items-center">
						<h3 class="sm:hidden inline basis-13 text-center shrink-0 translate-y-[1pt] text-2xl">{contest.icon}</h3>
						<h3 class="sm:text-2xl inline text-lg">{contest.name}</h3>
					</div>
					<span class="px-3 sm:p-0 text-ctp-subtext1"> {contest.summary} </span>
				</div>
			</div>
		</a>
	</div>
{/each}
