# phoXiv

## Building

First, install a Javascript runtime like [Bun](https://bun.com/). Then, run any of the scripts below with `bun run <script>` or the equivalent in whatever runtime you use. All important commands are in [package.json](./package.json).

- `dev` - run local development server
- `preview` - run deployment preview
- `deploy` - deploy to remote

This project is built with:

- Frontend: Svelte
- Backend: SvelteKit
- Database (not functional yet): Drizzle ORM
- UI Library: shadcn-svelte

## Structure

The structure of this website is as follows: competitions are known as "contests". Each contest is split into "years", and within a year, there are multiple "problems".

### Pregeneration

You may have noticed that the build script runs [problems.ts](./src/lib/pregen/problems.ts). This is a pregeneration script that generates the file [files.json](./src/lib/pregen/files.json) containing all the problems in a javascript object. The purpose of this is to make adding problems easier. In some ways this makes the website a glorified file explorer.

File syntax can be customised in [fileSyntax.ts](./src/lib/pregen/fileSyntax.ts).

## Adding content

### Adding new contests

1. Create a new entry in [contests.ts](./src/lib/pregen/contests.ts) with the information about the contest. This will automatically add the contest to the homepage and "registers" the contest in the automated scripts.
2. Add the necessary files to the folder in static, with the right file syntax.
3. Add a folder with the corresponding contest id in `./src/routes/contests`, and include a `+page.svx` file. Optionally include a description.

### Adding new problems

Most of the time, this is simply done by including the files in the contest folder within the static folder, with the necessary file syntax: `<year><file syntax>`. The file syntax indicates what kind of file it is (problem, solution etc.). The allowed file extensions are in the pregeneration file [problems.ts](./src/lib/pregen/problems.ts).

However, sometimes the problems are separated. The per-problem files should be included in the year's folder, i.e. `<contest>/<year>/`, with the syntax `<problem number><file syntax>`. The allowed problem numbers are in the pregeneration file too.

You may optionally include the problem names (titles) by editing [problemNames.csv](./src/lib/pregen/problemNames.csv) and running the conversion script [problemNames.ts](./src/lib/pregen/problemNames.ts) to generate [the json file](./src/lib/pregen/problemNames.json).

All of the pregeneration scripts can be run by simply doing `bun run pregen`.

## TODO

- include eupho statutes
- add a "hide solutions" button
- add a menu to scroll to years quickly
- add "collections" to group contests together
- dynamically generate contest urls
- make links in mdsvex external (use custom components)
- add problem names for ipho and apho
- maybe make files dynamically generated? As the repo gets larger the build time is getting longer. Using a CDN may be better
