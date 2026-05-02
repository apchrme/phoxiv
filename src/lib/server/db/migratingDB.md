# Migrating the DB from the old schema to the new schema

## Initial setup (should have already been done)

Remove `0001_..._.sql` first

```sh
# apply initial migration
bunx wrangler d1 migrations apply DB

# seed DB
bunx wrangler d1 execute DB --file=src/lib/server/db/seed.sql

```

## Migration

Put `001_..._.sql` back into the folder.


```sh
# clean up file types
bunx wrangler d1 execute DB --file=src/lib/server/db/convertFileType.sql

# migrate
bunx wrangler d1 migrations apply DB

```