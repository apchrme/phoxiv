ALTER TABLE `problem_files` RENAME COLUMN "file_type" TO "label";--> statement-breakpoint
ALTER TABLE `year_files` RENAME COLUMN "file_type" TO "label";--> statement-breakpoint
DROP INDEX `problem_files_problem_type_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `problem_files_problem_label_idx` ON `problem_files` (`problem_id`,`label`);--> statement-breakpoint
DROP INDEX `year_files_year_type_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `year_files_year_label_idx` ON `year_files` (`year_id`,`label`);--> statement-breakpoint
ALTER TABLE `olympiads` DROP COLUMN `year_file_types`;--> statement-breakpoint
ALTER TABLE `olympiads` DROP COLUMN `problem_file_types`;