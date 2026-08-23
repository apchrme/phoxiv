ALTER TABLE `account` ADD `issuer` text DEFAULT 'local:oauth:github' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `account_issuer_accountId_idx` ON `account` (`issuer`,`account_id`);