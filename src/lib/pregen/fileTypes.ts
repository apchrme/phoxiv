/**
 * Generic file types used across all contests.
 * Contest-specific types (e.g. "Paper 1" for spho) belong in the
 * contest's static/contests/<id>/index.yaml under `extraFileTypes`.
 *
 * ORDER MATTERS — the UI renders file links in this order.
 * Extra contest-specific types are appended after these.
 */

export type FileType = {
	suffix: string;
	label: string;
};

/** Year-level file types (e.g. 2025_S.pdf). Labels use the plural form. */
export const yearFileTypes: Record<string, FileType> = {
	problems:                 { suffix: '',         label: 'Problems' },
	problemsEn:               { suffix: '_EN',      label: 'Problems (EN)' },
	theory:                   { suffix: '_T',       label: 'Theory' },
	experiment:               { suffix: '_E',       label: 'Experiment' },
	solutions:                { suffix: '_S',       label: 'Solutions' },
	answerSheet:			  { suffix: '_A',       label: 'Answer Sheets' },
	theorySolutions:          { suffix: '_T_S',     label: 'Theory Solutions' },
	experimentSolutions:      { suffix: '_E_S',     label: 'Experiment Solutions' },
	theoryMarkingScheme:      { suffix: '_T_M',     label: 'Theory Marking Scheme' },
	experimentMarkingScheme:  { suffix: '_E_M',     label: 'Experiment Marking Scheme' },
	theoryInstructions:       { suffix: '_TG0',     label: 'Theory General Instructions' },
	experimentalInstructions: { suffix: '_EG0',     label: 'Experiment General Instructions' },
	experimentalFiles:        { suffix: '_E_F',     label: 'Experimental Files' },
	experimentalPresentation: { suffix: '_E_P',     label: 'Experimental Presentation' },
	report:                   { suffix: '_REP',     label: 'Report' },
	results:                  { suffix: '_R',       label: 'Results' },
	minutes:                  { suffix: '_min',     label: 'Minutes' },
	proceedings:              { suffix: '_proc',    label: 'Proceedings' },
	comments:                 { suffix: '_comments',label: 'Comments' },
};

/** Problem-level file types (e.g. T1_S.pdf). Labels use the singular form. */
export const problemFileTypes: Record<string, FileType> = {
	problem:      { suffix: '',     label: 'Problem' },
	problemEn:    { suffix: '_EN',  label: 'Problem (EN)' },
	solution:     { suffix: '_S',   label: 'Solution' },
	answerSheet:  { suffix: '_A',   label: 'Answer Sheet' },
	markingScheme:{ suffix: '_M',   label: 'Marking Scheme' },
	presentation: { suffix: '_P',   label: 'Presentation' },
};
