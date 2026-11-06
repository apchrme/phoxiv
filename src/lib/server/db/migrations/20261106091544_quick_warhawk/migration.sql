CREATE TABLE `badge_problems` (
	`badge_id` integer NOT NULL,
	`problem_id` integer NOT NULL,
	CONSTRAINT `badge_problems_pk` PRIMARY KEY(`badge_id`, `problem_id`),
	CONSTRAINT `fk_badge_problems_badge_id_badges_id_fk` FOREIGN KEY (`badge_id`) REFERENCES `badges`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_badge_problems_problem_id_problems_id_fk` FOREIGN KEY (`problem_id`) REFERENCES `problems`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `badges` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`icon` text NOT NULL,
	`color` text NOT NULL,
	`required_count` integer NOT NULL,
	`score_min_pct` real,
	`score_max_pct` real,
	`scope` text NOT NULL,
	`topics` text DEFAULT '[]' NOT NULL,
	`olympiad_ids` text DEFAULT '[]' NOT NULL,
	`display_order` integer DEFAULT 9999 NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_badges` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`user_id` text NOT NULL,
	`badge_id` integer NOT NULL,
	`earned_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_user_badges_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_user_badges_badge_id_badges_id_fk` FOREIGN KEY (`badge_id`) REFERENCES `badges`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `badge_problems_problem_idx` ON `badge_problems` (`problem_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_badges_user_badge_idx` ON `user_badges` (`user_id`,`badge_id`);--> statement-breakpoint
CREATE INDEX `user_badges_badge_idx` ON `user_badges` (`badge_id`);