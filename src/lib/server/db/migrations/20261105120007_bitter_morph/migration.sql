DROP INDEX IF EXISTS `account_issuer_accountId_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `account_providerId_accountId_idx` ON `account` (`provider_id`,`account_id`);--> statement-breakpoint
ALTER TABLE `account` DROP COLUMN `issuer`;