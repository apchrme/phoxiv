# Vendored pdf.js

`pdf.min.mjs` and `pdf.worker.min.mjs`, copied verbatim from
**pdfjs-dist@6.3.289**'s `build/` directory. Apache-2.0, © Mozilla.

## Why these files are checked in

Text extraction runs in the **contributor's browser**, never in the Worker — the
whole phoXiv server bundle is about 0.38 MB gzipped, and pdf.js is roughly
+0.5 MB gzipped, so parsing PDFs server-side would make the parser larger than
the application and charge that to cold-start parse time on every route. See
`docs/deployment.md`.

Keeping them here, under `static/`, is what makes that true in practice. They
are served by the `ASSETS` binding, so they are static assets and not Worker
script size, and `$lib/pdf-text.ts` reaches them through a **runtime string
URL** (`import(/* @vite-ignore */ '/vendor/pdfjs/pdf.min.mjs')`) — the one import
form Vite cannot resolve at build time, and therefore the one form that cannot
be emitted into the server build.

## Updating

```sh
bun add -d pdfjs-dist@latest
cp node_modules/pdfjs-dist/build/pdf.min.mjs      static/vendor/pdfjs/
cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs static/vendor/pdfjs/
```

Then bump `EXTRACTOR_VERSION` in `src/lib/pdf-text.ts` if the extraction output
changes, which re-queues every row with no migration, and re-run the bundle check
in `docs/deployment.md`.

The two files must come from the **same** pdfjs-dist version: pdf.js refuses to
run a worker whose version does not match the API's.

No cMaps or standard fonts are vendored. They matter only for certain CID-encoded
fonts; a document that needs them extracts as `empty` and shows up in the admin
panel's count rather than failing.
