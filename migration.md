## Pre-setup

Move all files from `static/olympiads` to `files/olympiads`. Then modify [utils.ts](src/lib/pregen/utils.ts) to 

```ts
export const STATIC_DIR = path.resolve('files/olympiads');
// export const STATIC_DIR = path.resolve('static/olympiads');
```

---

## Infrastructure setup

**1. Create the bucket:**
```sh
wrangler r2 bucket create phoxiv-files
```

**2. Enable public access** via the Cloudflare dashboard: Storage & Databases → R2 → your bucket → Settings → Public Access. Either use the provided `r2.dev` subdomain or connect a custom domain like `cdn.phoxiv.org`. The latter is strongly recommended — it's cleaner in shared links and you can switch storage providers later without breaking URLs.

**3. Upload existing files:**

Install [rclone](https://rclone.org/install/) and configure it for R2 following [Cloudflare's guide](https://developers.cloudflare.com/r2/examples/rclone/). Then:

```sh
# Initial bulk upload — mirrors your static/olympiads/ structure into the bucket
bun run sync:push
```

The files in R2 will be at keys like `olympiads/ipho/2025/T1.pdf`, making the public URL `https://cdn.phoxiv.org/olympiads/ipho/2025/T1.pdf` — identical in structure to your current `/olympiads/ipho/2025/T1.pdf` paths, just with a different base.

---

## Configuration and workflow

**`.env`** (already gitignored):
```sh
FILES_BASE_URL=https://cdn.phoxiv.org
```

Bun automatically loads `.env`, so `bun run pregen` will pick this up with no extra flags.

---

## Final steps: reducing the size of `.git`

Use git-filter-repo.

```sh
# Install
pip install git-filter-repo

# Remove all olympiad files, including legacy paths
git filter-repo --path 'static/olympiads/' --path 'static/contests/' --path 'static/apho/' --path 'static/eotvos/' --path 'static/eupho/' --path 'static/inpho/' --path 'static/ipho/' --path 'static/sjpo/' --path 'static/spho/' --path 'static/spot/' --path 'static/usapho/' --path 'static/usatst/'  --invert-paths
```

Then force-push.

```sh
git push origin --force --all
```

After that, anyone who has cloned the repo needs to re-clone — their history will have diverged and can't be cleanly reconciled with a pull.

---

## Contributor workflow

The `CONTRIBUTING.md` quickstart section should be updated to reflect the new step:

```md
# Install dependencies
bun install

# Sync problem files from R2 (requires rclone configured for R2)
bun run sync:pull

# Copy .env.example and fill in your values
cp .env.example .env

# Run pregeneration
bun run pregen

# Run local development server
bun run dev
```

When a contributor **adds new files**:
1. Drop them into `files/olympiads/<olympiad ID>/<year>/` locally
2. Run `bun run pregen` to update the JSON
3. Commit
4. Run `bun run sync:push` to upload the new files to R2
5. Open a PR with just the metadata changes

This means PRs stay small and reviewable, the repo stays lean, and the files are immediately live on R2 once pushed.
