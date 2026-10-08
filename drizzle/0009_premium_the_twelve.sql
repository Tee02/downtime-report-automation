CREATE TABLE `analysisComparisonHistories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`label` varchar(1024) NOT NULL,
	`scenariosJson` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `analysisComparisonHistories_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `analysisDailySnapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reportDate` varchar(10) NOT NULL,
	`reportId` int,
	`snapshotJson` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `analysisDailySnapshots_id` PRIMARY KEY(`id`),
	CONSTRAINT `analysisDailySnapshots_reportDate_unique` UNIQUE(`reportDate`)
);
--> statement-breakpoint
CREATE TABLE `faultpediaCards` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rideCode` varchar(32) NOT NULL,
	`rideName` varchar(512) NOT NULL,
	`faultDate` varchar(10) NOT NULL,
	`title` varchar(512) NOT NULL,
	`faultCode` varchar(255) NOT NULL DEFAULT 'Reference',
	`severity` varchar(16) NOT NULL DEFAULT 'Watch',
	`category` varchar(32) NOT NULL DEFAULT 'Other',
	`description` text NOT NULL,
	`rootCause` text NOT NULL,
	`correctiveAction` text NOT NULL,
	`preventiveAction` text NOT NULL,
	`referenceCount` int NOT NULL DEFAULT 0,
	`manualScreenshotName` varchar(512),
	`manualScreenshotUrl` text,
	`supportPhotoName` varchar(512),
	`supportPhotoUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `faultpediaCards_id` PRIMARY KEY(`id`)
);
