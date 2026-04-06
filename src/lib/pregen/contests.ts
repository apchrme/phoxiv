export type ContestTag = 'International' | 'Regional' | 'National' | 'Open';

export const contests = [
	{
		id: 'eupho',
		name: 'European Physics Olympiad',
		summary: 'A relatively new and highly interesting olympiad',
		icon: '🇪🇺',
		tag: 'Regional' as ContestTag
	},
	{
		id: 'ipho',
		name: 'International Physics Olympiad',
		summary: 'The most well-known physics olympiad, attracting participants from 90+ countries',
		icon: '🌐',
		tag: 'International' as ContestTag
	},
	{
		id: 'aupho',
		name: 'Australian Physics Olympiad',
		summary: 'An olympiad known for many real-life/experimentals physics problems.',
		icon: '🇦🇺',
		tag: 'Regional' as ContestTag
	},
	{
		id: 'apho',
		name: 'Asian Physics Olympiad',
		summary: 'The Asian version of IPhO, often used by countries to select their IPhO teams.',
		icon: '🌏',
		tag: 'Regional' as ContestTag
	},
	{
		id: 'nbpho',
		name: 'Nordic-Baltic Physics Olympiad',
		summary: 'A short and sweet competition used as a team selection test for IPhO in a few countries',
		icon: '🇪🇪',
		tag: 'Regional' as ContestTag
	},
	{
		id: 'usapho',
		name: 'USA Physics Olympiad',
		summary: 'Second round of selection for the US Physics Team',
		icon: '🇺🇸',
		tag: 'National' as ContestTag
	},
	{
		id: 'usatst',
		name: 'USA Team Selection Test',
		summary: 'Final round of selection for the US Physics Team',
		icon: '🇺🇸',
		tag: 'National' as ContestTag
	},
	{
		id: 'eotvos',
		name: 'Eötvös Competition',
		summary: 'One of the oldest high school physics contests.',
		icon: '🇭🇺',
		tag: 'National' as ContestTag
	},
	{
		id: 'pcup',
		name: 'Physics Cup',
		summary: 'The most difficult high school physics contest',
		icon: '🏆',
		tag: 'Open' as ContestTag
	},
	{
		id: 'spot',
		name: 'Singapore IPhO/APhO TST',
		summary: 'Selection test for the Singapore team at IPhO and APhO.',
		icon: '🇸🇬',
		tag: 'National' as ContestTag
	},
	{
		id: 'cpho-f',
		name: 'Chinese Physics Olympiad (Finals)',
		summary: 'Third phase of selection for the Chinese IPhO team',
		icon: '🇨🇳',
		tag: 'National' as ContestTag
	},
	{
		id: 'inpho',
		name: 'Indian National Physics Olympiad',
		summary: 'Second round of selection for the Indian IPhO team.',
		icon: '🇮🇳',
		tag: 'National' as ContestTag
	},
	{
		id: 'sjpo',
		name: 'Singapore Junior Physics Olympiad',
		summary: 'A well-set national olympiad for secondary school students',
		icon: '🇸🇬',
		tag: 'National' as ContestTag
	},
	{
		id: 'spho',
		name: 'Singapore Physics Olympiad',
		summary: 'The first round of the selection for IPhO in Singapore',
		icon: '🇸🇬',
		tag: 'National' as ContestTag
	}
];
