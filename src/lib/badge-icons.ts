import type { Component } from 'svelte';
import TrophyIcon from '@lucide/svelte/icons/trophy';
import MedalIcon from '@lucide/svelte/icons/medal';
import AwardIcon from '@lucide/svelte/icons/award';
import CrownIcon from '@lucide/svelte/icons/crown';
import StarIcon from '@lucide/svelte/icons/star';
import SparklesIcon from '@lucide/svelte/icons/sparkles';
import GemIcon from '@lucide/svelte/icons/gem';
import TargetIcon from '@lucide/svelte/icons/target';
import FlameIcon from '@lucide/svelte/icons/flame';
import ZapIcon from '@lucide/svelte/icons/zap';
import AtomIcon from '@lucide/svelte/icons/atom';
import OrbitIcon from '@lucide/svelte/icons/orbit';
import RocketIcon from '@lucide/svelte/icons/rocket';
import TelescopeIcon from '@lucide/svelte/icons/telescope';
import MagnetIcon from '@lucide/svelte/icons/magnet';
import ThermometerIcon from '@lucide/svelte/icons/thermometer';
import LightbulbIcon from '@lucide/svelte/icons/lightbulb';
import SigmaIcon from '@lucide/svelte/icons/sigma';
import InfinityIcon from '@lucide/svelte/icons/infinity';
import MountainIcon from '@lucide/svelte/icons/mountain';
import type { BadgeIcon } from '#lib/badges.js';

/**
 * The component for each badge icon key. Separate from `#lib/badges.ts` so the
 * server can validate keys without importing components. A key missing here
 * fails `bun run check`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const BADGE_ICONS: Record<BadgeIcon, Component<any>> = {
	trophy: TrophyIcon,
	medal: MedalIcon,
	award: AwardIcon,
	crown: CrownIcon,
	star: StarIcon,
	sparkles: SparklesIcon,
	gem: GemIcon,
	target: TargetIcon,
	flame: FlameIcon,
	zap: ZapIcon,
	atom: AtomIcon,
	orbit: OrbitIcon,
	rocket: RocketIcon,
	telescope: TelescopeIcon,
	magnet: MagnetIcon,
	thermometer: ThermometerIcon,
	lightbulb: LightbulbIcon,
	sigma: SigmaIcon,
	infinity: InfinityIcon,
	mountain: MountainIcon
};
