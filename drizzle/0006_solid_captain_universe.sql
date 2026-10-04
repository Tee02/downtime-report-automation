CREATE TABLE `downtimeSummaryDrafts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reportDate` varchar(10) NOT NULL,
	`zone` varchar(32) NOT NULL DEFAULT 'Zone A',
	`rideCode` varchar(32) NOT NULL,
	`attraction` varchar(512) NOT NULL DEFAULT '',
	`description` text NOT NULL DEFAULT (''),
	`downtimeStart` varchar(16) NOT NULL DEFAULT '',
	`downtimeEnd` varchar(16) NOT NULL DEFAULT '',
	`durationMinutes` int NOT NULL DEFAULT 0,
	`rootCause` text,
	`correctiveAction` text,
	`preventiveAction` text,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `downtimeSummaryDrafts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `downtimeSummaryImports` ADD `convertedDocxFileName` varchar(512);--> statement-breakpoint
ALTER TABLE `downtimeSummaryImports` ADD `convertedDocxUrl` text;--> statement-breakpoint
ALTER TABLE `downtimeSummaryImports` ADD `matchedEntries` text;