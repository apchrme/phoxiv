import fs from 'fs';
import { parse } from 'csv-parse';

const results = {};
const parser = parse({ columns: true, trim: true });

fs.createReadStream('./src/pregen/problemNames.csv')
  .pipe(parser)
  .on('data', (row) => {
    const columns = Object.keys(row);
    const key = row[columns[0]]; // Use first column as key
    const entry = {}; // Object to store the rest of the row

    // Build the object excluding the first column
    columns.slice(1).forEach(col => {
      entry[col] = row[col];
    });

    if (!results[key]) {
      results[key] = [];
    }

    results[key].push(entry);
  })
  .on('end', () => {
    // console.log(JSON.stringify(results, null, 2));
    // Optionally write to file:
    fs.writeFileSync('src/pregen/problemNames.json', JSON.stringify(results, null, 2));
  });
