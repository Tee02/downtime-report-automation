ALTER TABLE `downtimeSummaryDrafts` MODIFY COLUMN `description` text;--> statement-breakpoint
ALTER TABLE `downtimeSummaryEntries` ADD `recurringDowntime` varchar(8) DEFAULT 'No' NOT NULL;--> statement-breakpoint
ALTER TABLE `downtimeSummaryEntries` ADD `recurringDowntimeDays` varchar(32) DEFAULT 'N/A' NOT NULL;--> statement-breakpoint
ALTER TABLE `downtimeSummaryEntries` ADD `incident` varchar(8) DEFAULT 'No' NOT NULL;