/*

This file automatically generates links to the files on the website by reading the /static folder

*/

import { contests } from './contests.js';
import { fileSyntax } from './fileSyntax.js';
import problemNames from './problemNames.json';
import fs from 'fs';
import path from 'path';

// exports all problems grouped by the contest id
const all_problems = {};
const problemNumbers = ['T1', 'T2', 'T3', 'T4', 'E1', 'E2', 'T5'];
const fileExtensions = ['pdf', 'xlsx', 'zip', 'htm', 'html', 'doc', 'docx'];

// iterate through contests
contests.forEach(function (contest) {
	// finds the contest files in the static folder
	const folderPath = path.resolve('static/contests/', contest.id);
	const contestFiles = fs.readdirSync(folderPath);
	let yearList = [];

	// iterate through years
	contestFiles.forEach(function (year) {
		// must be a valid directory and not a file
		if (!year.includes('.') && !year.includes('_')) {
			const yearFolderPath = path.resolve('static/contests/', contest.id, year);
			const yearGeneralFiles = fs.readdirSync(yearFolderPath); // all problem-specific files for that year
			const problemList = { year: parseInt(year), files: [] }; // this collects the list of problems for that year

			// add problem names
			let problemNamesPerYear = {};
			if (problemNames[contest.id]) {
				problemNamesPerYear = problemNames[contest.id].find(
					(yearObj) => yearObj.year == year.toString()
				);
			}

			// iterate through problems within a year
			problemNumbers.forEach(function (problemNumber) {
				// include problem title if it exists
				const fileList = { number: problemNumber };
				if (problemNamesPerYear && problemNamesPerYear[problemNumber]) {
					fileList.title = problemNamesPerYear[problemNumber];
				} else {
					fileList.title = '';
				}
				let empty: boolean = true;

				// iterates through all filetypes (problem, solution, etc.)
				fileSyntax.forEach(function (fileType) {
					// some filetypes are contest-specific
					if (!fileType.contests || fileType.contests.includes(contest.id)) {
						let file = '';
						fileExtensions.forEach((extension) => {
							// only include the file if it exists in the directory
							if (
								yearGeneralFiles.find((i) => i == problemNumber + fileType.syntax + '.' + extension)
							) {
								file = yearGeneralFiles.find(
									(i) => i == problemNumber + fileType.syntax + '.' + extension
								);
							}
						});
						// only add file if it exists
						if (file != '') {
							empty = false;
							fileList[fileType.id] = `/contests/${contest.id}/${year}/${file}`;
						}
					}
				});

				// only add the problem if it has any files
				if (!empty) {
					problemList.files.push(fileList);
				}
			});
			// Add the entry for that year
			yearList.push(problemList);
		}
	});

	// this portion is for the files that apply for the entire year
	// iterates through the years, grouping together files of the same year
	for (let year = 1950; year <= 2100; year++) {
		// update in 2100
		let fileList = [];
		let empty: boolean = true;
		if (yearList.find((yearObj) => yearObj.year == year)) {
			fileList = yearList.find((yearObj) => yearObj.year == year);
			yearList = yearList.filter(function (el) {
				return el.year != year;
			});
			empty = false; // this marks the year as non-empty so it won't get skipped later
		} else {
			fileList = { year: year };
		}

		// iterates through all filetypes (problem, solution, etc.)
		fileSyntax.forEach(function (fileType) {
			// some filetypes are contest-specific
			if (!fileType.contests || fileType.contests.includes(contest.id)) {
				let file = '';
				fileExtensions.forEach((extension) => {
					if (contestFiles.find((i) => i == year.toString() + fileType.syntax + '.' + extension)) {
						file = contestFiles.find(
							(i) => i == year.toString() + fileType.syntax + '.' + extension
						);
					}
				});
				if (file != '') {
					empty = false;
					fileList[fileType.id] = `/contests/${contest.id}/${file}`;
				}
			}
		});

		// only add the year if it has any files
		if (!empty) {
			yearList.push(fileList);
		}
	}

	// sort by decreasing year
	all_problems[contest.id] = yearList.sort((a, b) => b.year - a.year);
});

// console.log(all_problems);

fs.writeFileSync(
	path.resolve('./src/lib/pregen/files.json'),
	JSON.stringify(all_problems, null, 4)
);
