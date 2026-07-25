-- Article language and translation links
ALTER TABLE `feeds` ADD COLUMN `language` text DEFAULT 'en' NOT NULL;
--> statement-breakpoint
ALTER TABLE `feeds` ADD COLUMN `translation_group` integer;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_feeds_language` ON `feeds` (`language`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_feeds_translation_group` ON `feeds` (`translation_group`);
--> statement-breakpoint
UPDATE `info` SET `value` = '11' WHERE `key` = 'migration_version';