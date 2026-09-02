-- Custom SQL migration file, put your code below! --
--
-- HAND-WRITTEN ON PURPOSE — the one exception to CLAUDE.md rule 1, and the only
-- file under migrations/ that is. drizzle-kit cannot express a virtual table or a
-- trigger, so this folder was created with `drizzle-kit generate --custom`, which
-- writes the snapshot.json beside this file itself: that snapshot is a chained
-- copy of the previous one, so the objects below are absent from every snapshot
-- AND from schema.ts, and `db:generate` — which diffs those two and never reads
-- the database — can therefore never emit a DROP for them.
--
-- `bun run db:push` is the exception to the exception: it introspects the live
-- database and WILL want to drop everything below. Never point it at anything
-- real once this is applied.
--
-- Recovery: re-run these statements, then
--   INSERT INTO file_text_fts(file_text_fts) VALUES('rebuild');
-- The index is external-content, so that reconstructs it from file_text with NO
-- re-extraction and no AI calls. See docs/data-model.md#the-full-text-index.
--
-- External content, not contentless and not plain: contentless cannot return
-- column values, so snippet() would be unavailable, and a plain fts5 table would
-- store a second copy of every text. External content stores the index only and
-- reads the column back from file_text for snippets — which also makes a later
-- tokenizer change a DROP/CREATE/'rebuild' with zero re-extraction.
--
-- Triggers rather than application-maintained rows, because docs/deployment.md
-- documents `wrangler d1 execute` as the supported way to make a bulk
-- correction, and any such hand-edit would desync an app-maintained index. A
-- trigger is correct regardless of who writes.
--
-- coalesce(…, '') UNCONDITIONALLY, never a WHEN guard: with external content the
-- delete-side value must match what is in the index, or the index silently
-- corrupts. Asymmetric guards are exactly how that happens.

CREATE VIRTUAL TABLE `file_text_fts` USING fts5(
	text,
	content='file_text',
	content_rowid='id',
	tokenize='unicode61 remove_diacritics 2',
	prefix='2 3'
);
--> statement-breakpoint
INSERT INTO `file_text_fts`(rowid, text) SELECT id, coalesce(text, '') FROM `file_text`;
--> statement-breakpoint
CREATE TRIGGER `file_text_fts_ai` AFTER INSERT ON `file_text` FOR EACH ROW BEGIN
	INSERT INTO `file_text_fts`(rowid, text) VALUES (new.id, coalesce(new.text, ''));
END;
--> statement-breakpoint
CREATE TRIGGER `file_text_fts_ad` AFTER DELETE ON `file_text` FOR EACH ROW BEGIN
	INSERT INTO `file_text_fts`(`file_text_fts`, rowid, text) VALUES ('delete', old.id, coalesce(old.text, ''));
END;
--> statement-breakpoint
CREATE TRIGGER `file_text_fts_au` AFTER UPDATE ON `file_text` FOR EACH ROW BEGIN
	INSERT INTO `file_text_fts`(`file_text_fts`, rowid, text) VALUES ('delete', old.id, coalesce(old.text, ''));
	INSERT INTO `file_text_fts`(rowid, text) VALUES (new.id, coalesce(new.text, ''));
END;
