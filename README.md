
# Structure

The structure of this website is as follows: competitions are known as "contests". Each contest is split into "years", and within a year, there are multiple "problems".

## Pregeneration

You may have noticed that the build script runs [problems.ts](./src/pregen/problems.ts). This is a pregeneration script that generates the file [files.json](./src/pregen/files.json) containing all the problems in a javascript object. The purpose of this is to make adding problems easier. In some ways this makes the website a glorified file explorer. 

File syntax can be customised in [fileSyntax.ts](./src/pregen/fileSyntax.ts).

# Adding content

## Adding new contests
1. Create a new entry in [contests.ts](./src/pregen/contests.ts) with the information about the contest. This will automatically add the contest to the homepage and "registers" the contest in the automated scripts.
2. Add the necessary files to the folder in static, with the right file syntax.
3. Setup the contest page with the following template:

    ```sv
    <script lang="ts">
        import YearList from "$lib/YearList.svelte";
    </script>

    insert description here

    <YearList contestId="insert contest id here"/>
    ```

## Adding new problems

Most of the time, this is simply done by including the files in the contest folder within the static folder, with the necessary file syntax: `<year><file syntax>`. The file syntax indicates what kind of file it is (problem, solution etc.). The allowed file extensions are in the pregeneration file [problems.ts](./src/pregen/problems.ts). 

However, sometimes the problems are separated. The per-problem files should be included in the year's folder, i.e. `<contest>/<year>/`, with the syntax `<problem number><file syntax>`. The allowed problem numbers are in the pregeneration file too.

You may optionally include the problem names (titles) by editing [problemNames.csv](./src/pregen/problemNames.csv) and running the conversion script [problemNames.ts](./src/pregen/problemNames.ts) to generate [the json file](./src/pregen/problemNames.json).


# TODO

- include eupho statutes
- add a "hide solutions" button
- add a menu to scroll to years quickly
- add "collections" to group contests together
- dynamically generate contest urls
- make links in mdsvex external (use custom components)

