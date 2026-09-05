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

Keep the `pdfjs-dist` devDependency on the **same version as these two files**.
It ships no runtime code into either bundle — `$lib/pdf-text.ts` imports only its
types, which are erased at compile time — but those types are the only thing
standing between a removed pdf.js API and a silent failure, and they describe
whatever version is in `node_modules`, not whatever is in this directory.

Then bump `EXTRACTOR_VERSION` — it lives in **`src/lib/search.ts`**, beside the
other rules the browser, the server and `reindex-cli.ts` all share, not in
`pdf-text.ts` — if the extraction *output* changes, which re-queues every row
with no migration. A change that only fixes a crash does not qualify: re-running
the whole ~2,100-file corpus is not free. Then re-run the bundle check in
`docs/deployment.md`.

The two files must come from the **same** pdfjs-dist version: pdf.js refuses to
run a worker whose version does not match the API's.

### What to check when the major version moves

pdf.js reorganises its cleanup and its `getDocument` options between majors, and
`pdf-text.ts` uses both. Version 6 is a worked example of how quietly that
breaks: it removed `PDFDocumentProxy.destroy()`, moving teardown to
`PDFDocumentLoadingTask.destroy()`, and it deleted the `isEvalSupported` option
along with the eval fast-path that option existed to disable. Neither removal is
an error at the call site — a missing method throws only when reached, and
`getDocument` destructures named properties, so an unknown key is simply ignored.
Both had to be found by reading the build. So, on a major bump:

- Confirm what owns teardown. Destroying the **task** is what releases a
  document; a `finally` that throws discards the text the `try` just produced.
- Diff the `DocumentInitParameters` type for options that have gone.
- Confirm `PDFWorker` is still constructible and still exposes `destroyed`, and
  that `PDFDocumentLoadingTask.destroy()` still leaves a worker it was *handed*
  alone — `pdf-text.ts` shares one worker across every file a contributor picks
  and relies on exactly that.
- Then run `bun run check`. With the real types in place it now catches this
  class of bug at compile time, which is the whole reason the hand-written
  structural types were deleted.

No cMaps or standard fonts are vendored. They matter only for certain CID-encoded
fonts; a document that needs them extracts as `empty` and shows up in the admin
panel's count rather than failing.
