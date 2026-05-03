# Migrating the DB from the old schema to the new schema

## Seeding R2 and D1

With the files in `files/`, run `migrate-to-d1.ts` to generate the seed. Use rclone to sync to R2.

```sh
## pregen first
bun run src/lib/pregen/generate.ts

## create seed file
bun run src/lib/pregen/migrate-to-d1.ts

## sync with R2
rclone sync files/ r2:phoxiv-files/ --progress

```

## Initial setup (should have already been done)

Remove `0001_..._.sql` first

```sh
# apply initial migration
bunx wrangler d1 migrations apply DB

# seed DB
bunx wrangler d1 execute DB --file=src/lib/pregen/seed.sql

```

## Migration

Put `0001_..._.sql` back into the folder.


```sh
# clean up file types
bunx wrangler d1 execute DB --file=src/lib/pregen/convertFileType.sql

# migrate
bunx wrangler d1 migrations apply DB

```