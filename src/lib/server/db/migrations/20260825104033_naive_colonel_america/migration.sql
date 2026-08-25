CREATE TABLE `problem_progress` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`user_id` text NOT NULL,
	`problem_id` integer NOT NULL,
	`score` real,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_problem_progress_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_problem_progress_problem_id_problems_id_fk` FOREIGN KEY (`problem_id`) REFERENCES `problems`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
ALTER TABLE `problems` ADD `max_score` real;--> statement-breakpoint
CREATE UNIQUE INDEX `problem_progress_user_problem_idx` ON `problem_progress` (`user_id`,`problem_id`);