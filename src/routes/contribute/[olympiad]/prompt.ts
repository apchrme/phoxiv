import { PROBLEM_TOPICS } from '#lib/types.js';
import { CSV_TOPIC_SEPARATOR } from '#lib/utils/topics.js';

/**
 * The prompt the Import card's **Copy AI prompt** button copies. It is written
 * for an agent with web access: it reads `/api/olympiads/<id>` (a `YearEntry[]`)
 * and the files it links to, and writes a `titles.csv`. It restates the
 * `importTitles` contract (docs/data-model.md, "The `titles.csv` contract") and
 * describes that endpoint's shape, so change it with either. Topics and their
 * separator come from the same constants the import reads.
 *
 * `origin` is the site's own, so a prompt copied from a local build points at it.
 */
export function titlesCsvPrompt(olympiad: { id: string; name: string }, origin: string): string {
	const topics = PROBLEM_TOPICS.join(CSV_TOPIC_SEPARATOR);
	const api = `${origin}/api/olympiads/${olympiad.id}`;

	return `You are helping me fill in problem metadata for ${olympiad.name} (${olympiad.id}) on phoXiv, an archive of high-school physics olympiad problems. Read the olympiad's problems and papers from phoXiv, then write a CSV file that phoXiv can import.

WHERE THE DATA IS
- Fetch ${api}. It returns a JSON array with one object per year: { year, yearFiles, problems }.
- yearFiles lists the whole year's files, and each problem's files list its own. Every file is { label, url }: the label says what it is (problem, solution, marking scheme and so on) and the url is a direct link, usually to a PDF. Open the ones you need.
- Each problem is { number, title?, topics, maxScore?, files }. A missing title or maxScore, or an empty topics list, means that value isn't set yet. That's what you are filling in.
- If phoXiv has no file that answers a question, you may use the olympiad's official website. Say which values came from there.

FORMAT
- The first line is exactly: year,number,title,topics,max_score
- Then one line per problem, ordered by year and then by problem.
- Separate fields with commas. If a field contains a comma or a double quote, wrap the whole field in double quotes and double each quote inside it, e.g. "Springs, ""Coupled""".
- Put the CSV in a single \`\`\`csv code block, with no blank lines or comments inside it.

COLUMNS
- year: the four-digit year, as in the JSON.
- number: for a problem the JSON lists, copy its number exactly. phoXiv matches rows by year and number, so a different label (1 instead of T1, say) creates a duplicate problem instead of filling in the existing one. Never use "/".
- title: the problem's title as the paper prints it, in plain text (no LaTeX or Markdown). Turn an ALL-CAPS heading into title case. Leave it empty if the paper gives no title; don't make one up.
- topics: the main areas of physics the problem uses, usually one or two, from exactly these names: ${topics}. Separate several with semicolons and no spaces, e.g. Mechanics;Waves and Optics. Experiment is not an area of physics: add it to every experimental problem (one set in the experimental exam or paper), alongside that problem's areas, e.g. Electromagnetism;Experiment. Never give Experiment to a theory problem. Use Others only when none of the areas fit. Any other name is ignored.
- max_score: the total marks the problem is worth, as a plain number above zero, e.g. 10 or 7.5, with no units. The marking scheme or the paper's header usually gives it. Leave it empty if you can't find it.

RULES
- Include a row for every problem that is missing a title, topics or max score, or is an experimental problem whose topics don't include Experiment. Leave out the other problems: phoXiv leaves a problem the CSV doesn't mention unchanged.
- A filled-in cell replaces the value phoXiv already has, and an empty cell keeps it. So fill in only the values that are missing, and leave every cell whose value is already set empty. The exception is topics: for an experimental problem missing Experiment, write its full topic list, the existing topics plus Experiment, because the cell replaces the whole list.
- If a value that is already set looks wrong, don't change it in the CSV. List it after the code block instead.
- If a year's papers hold problems the JSON doesn't list, add rows for them, numbered the way that year's other problems are.
- Use only what the papers say. When you're unsure of a value, leave its cell empty instead of guessing: an empty cell costs nothing, and a wrong one has to be fixed by hand.

EXAMPLE
\`\`\`csv
year,number,title,topics,max_score
2019,T1,Physics of a Slinky,Mechanics;Waves and Optics,10
2019,T2,"Springs, ""Coupled""",Mechanics,10
2019,T3,,,
2019,E1,Magnetic Permeability of Water,Electromagnetism;Experiment,10
\`\`\`

After the code block, list each cell you left empty or weren't sure about, with the reason, so I can check it.
`;
}
