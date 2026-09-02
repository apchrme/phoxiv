CREATE TABLE `file_text` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`url` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`text` text,
	`chars` integer DEFAULT 0 NOT NULL,
	`truncated` integer DEFAULT false NOT NULL,
	`etag` text,
	`bytes` integer,
	`ext` text DEFAULT '' NOT NULL,
	`extractor_version` integer DEFAULT 0 NOT NULL,
	`engine` text DEFAULT '' NOT NULL,
	`error` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `file_text_url_idx` ON `file_text` (`url`);--> statement-breakpoint
CREATE INDEX `file_text_status_idx` ON `file_text` (`status`);--> statement-breakpoint
CREATE INDEX `problem_files_url_idx` ON `problem_files` (`url`);--> statement-breakpoint
CREATE INDEX `year_files_url_idx` ON `year_files` (`url`);