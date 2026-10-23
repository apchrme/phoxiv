ALTER TABLE `problem_files` ADD `position` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `problem_files` ADD `uploaded_by` text REFERENCES user(id) ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE `year_files` ADD `position` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `year_files` ADD `uploaded_by` text REFERENCES user(id) ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX `problem_files_uploaded_by_idx` ON `problem_files` (`uploaded_by`);--> statement-breakpoint
CREATE INDEX `year_files_uploaded_by_idx` ON `year_files` (`uploaded_by`);