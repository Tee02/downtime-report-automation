ALTER TABLE `downtimeSummaries` ADD `zoneBAmExecutive` varchar(255) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `downtimeSummaries` ADD `zoneBPmExecutive` varchar(255) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `downtimeSummaryImports` ADD `extractedText` text;