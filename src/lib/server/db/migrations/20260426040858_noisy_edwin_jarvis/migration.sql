CREATE TABLE `olympiads` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`summary` text NOT NULL,
	`icon` text DEFAULT '' NOT NULL,
	`tag` text NOT NULL,
	`display_order` integer DEFAULT 9999 NOT NULL,
	`description_md` text,
	`description_html` text,
	`year_file_types` text DEFAULT '{}' NOT NULL,
	`problem_file_types` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `problem_files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`problem_id` integer NOT NULL,
	`file_type` text NOT NULL,
	`url` text NOT NULL,
	FOREIGN KEY (`problem_id`) REFERENCES `problems`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `problem_files_problem_type_idx` ON `problem_files` (`problem_id`,`file_type`);--> statement-breakpoint
CREATE TABLE `problems` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`year_id` integer NOT NULL,
	`number` text NOT NULL,
	`title` text,
	FOREIGN KEY (`year_id`) REFERENCES `years`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `problems_year_number_idx` ON `problems` (`year_id`,`number`);--> statement-breakpoint
CREATE TABLE `year_files` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`year_id` integer NOT NULL,
	`file_type` text NOT NULL,
	`url` text NOT NULL,
	FOREIGN KEY (`year_id`) REFERENCES `years`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `year_files_year_type_idx` ON `year_files` (`year_id`,`file_type`);--> statement-breakpoint
CREATE TABLE `years` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`olympiad_id` text NOT NULL,
	`year` integer NOT NULL,
	`notes` text DEFAULT '[]' NOT NULL,
	`extra_links` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`olympiad_id`) REFERENCES `olympiads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `years_olympiad_year_idx` ON `years` (`olympiad_id`,`year`);