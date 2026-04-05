/**
 * Returns true if AdditionalYearFiles.svelte would render any content
 * for the given contestId and year. Must be kept in sync with that component.
 */
export function hasAdditionalYearFiles(contestId: string, year: number): boolean {
	return (
		(contestId === 'ipho' && year === 2017) ||
		(contestId === 'ipho' && year === 2020) ||
		(contestId === 'apho' && year === 2022) ||
		(contestId === 'apho' && year === 2017) ||
		(contestId === 'apho' && year === 2025)
	);
}
