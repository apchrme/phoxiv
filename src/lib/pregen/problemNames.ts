import fs from 'fs';
import { parse } from 'csv-parse';

type ProblemEntry = Record<string, string>;
type ResultsMap = Record<string, ProblemEntry[]>;

const results: ResultsMap = {};

const parser = parse({ 
	columns: true, 
	trim: true
});

fs.createReadStream('./src/lib/pregen/problemNames.csv')
	.pipe(parser)
	.on('data', (row: Record<string, string>) => {
		const columns = Object.keys(row);
		if (columns.length === 0) return;

		const key = row[columns[0]];
		const entry: ProblemEntry = {};

		// Build the object excluding the first column (the key)
		columns.slice(1).forEach((col) => {
			entry[col] = row[col];
		});

		if (!results[key]) {
			results[key] = [];
		}

		results[key].push(entry);
	})
	.on('end', () => {
		try {
			fs.writeFileSync(
				'src/lib/pregen/problemNames.json', 
				JSON.stringify(results, null, 2)
			);
			console.log('Successfully converted CSV to JSON.');
		} catch (err) {
			console.error('Failed to write file:', err);
		}
	})
	.on('error', (err: Error) => {
		console.error('Parsing error:', err.message);
	});