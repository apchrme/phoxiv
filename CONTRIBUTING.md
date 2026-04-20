# Contributing

To contribute, fork the repository, make your own changes on a separate branch, then open a pull request. See the [GitHub docs](https://docs.github.com/en/get-started/exploring-projects-on-github/contributing-to-a-project) for more information. You may also want to look at the [Open Source Guide](https://opensource.guide/how-to-contribute/)

## Quickstart

Install [bun](https://bun.com). Then, in your local repository folder, run

```sh
# Install dependencies
bun install

# Run local development server
bun run dev
```

This project is built with:

- Frontend: Svelte
- Backend: SvelteKit
- Database (not functional yet): Drizzle ORM
- UI Library: shadcn-svelte

## Adding content

### Directory structure

**The hierarchy is olympiad -> year -> problem.** The types of files and how to structure the config files will be explained below.

```
static
└── olympiads
    └── <olympiad ID>
        ├── index.yaml # olympiad config
        ├── <year><suffix> # year-level file
        |
        |   # Examples
        ├── 2025.pdf # problems for the year 2025
        ├── 2025_S.pdf # solutions for the year 2025
        |
        └── <year>
            ├── index.yaml # year config (optional)
            ├── <problem number><suffix> # problem-level file
            |
            |   # Examples
            ├── T1.pdf # T1 problem pdf
            └── T1_M.pdf # Marking scheme for T1

```

### Adding new olympiads

1. Choose a unique olympiad ID. It will be matched in search results, so choose something that people often use as a shorthand for the competition (like `ipho` for the International Physics Olympiad)
2. Create an `index.yaml` file in the path `/static/olympiads/<olympiad ID>/index.yaml` with the following structure. This is the **olympiad config**.

```yaml
# /static/olympiads/<olympiad ID>/index.yaml

name: The Physics Olympiad

# summary appears on the list of olympiads
summary: One of the physics olympiads of all time

# (Optional) You can use a flag emoji, and it will not look ugly on Windows (Chromium) because the flags will be replaced by SVGs from Flagpedia. If you want to add a custom icon that is not an emoji, put it in src/lib/assets/icons/olympiads/<olympiad ID>.<file extension>
icon: ⚛️

# tag can be International, Regional, National or Open
tag: International

# (Optional) Order the olympiad appears on the list of olympiads.
order: 2

# (Optional) additional file types to contain niche files
extraFileTypes:
  year:
    extraMinutes:
      suffix: "_min2",
      label: "Extraordinary Minutes"
  problem:
    calibration:
      suffix: "_C"
      label: "Calibration"

# (Optional) this appears in the olympiad page itself. Markdown can be used.
description: |
  This is a description
  This is the second line
  This is a bonus line with a [link](https://example.com)

```

### Adding new problems

There are different **file types**, such as problems and solutions. You can indicate what type a file is by appending a suffix. The default suffixes can be found in [fileTypes.ts](/src/lib/pregen/fileTypes.ts), but you can add more in the olympiad config described above.

There are two "levels" of files you can add:

1. Year-level files: these are the files that apply to all problems within that year. For example, the USAPhO 2025 problem pdf contains all problems, so it is a year-level file.
2. Problem-level files: files that only apply to a specific problem, like T1, T1 solutions, etc. The allowed problem numbers are in the pregeneration file [generate.ts](/src/lib/pregen/generate.ts).

The syntax and file location of these files can be found in the directory structure above.

Problem titles and external links/comments can be configured in the optional **year config**, at `/static/olympiads/<olympiad id>/<year>/index.yaml`. The year config has the following structure:

```yaml
# /static/olympiads/<olympiad ID>/<year>/index.yaml

# problem titles
problems:
  T1:
    title: On Newton's 4th law
  T2:
    title: The Industrial Revolution and its consequences
  T3:
    title: Time Dilation in Interstellar
  E1:
    title: Measuring the speed of light
  E2:
    title: Finding dark matter

# additional notes
notes:
  - "Note: I love this year's problems!"

# links that are not associated with the files in /static
extraLinks:
  - label: Official website
    url: https://example.com
```

### Pregeneration

After modifying/adding any files in `static/`, run the command `bun run pregen` to update your local development server.

If you're wondering why you have to do this, it is because the site generates hyperlinks and other data based on the `.json` files in `src/lib/pregen/output/`, and does not read the files in `static/`. The files in static are converted to the json files by the pregeneration script [generate.ts](src/lib/pregen/generate.ts), which can be run with the command above. This is for the sake of performance, but also because the filesystem is not accessible in Cloudflare Workers. The available flags are listed here:

```sh
bun run pregen
  --olympiads
  --files
  --stats
  --search

```

## TODO

### High priority

- add a "hide solutions" button

### Medium priority

- maybe make files dynamically generated by Vite? As the repo gets larger the build time is getting longer. Using a CDN may be better. See [SvelteKit's /static documentation](https://svelte.dev/docs/kit/project-structure#Project-files-static) or the [image documentation](https://svelte.dev/docs/kit/images#Vite's-built-in-handling)

### Low priority

- include eupho statutes
- add "collections" to group olympiads together
- make links in mdsvex external (use custom components)
