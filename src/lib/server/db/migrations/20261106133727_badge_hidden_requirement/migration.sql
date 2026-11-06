ALTER TABLE `badges` ADD `requirement_hidden` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `badges` DROP COLUMN `display_order`;