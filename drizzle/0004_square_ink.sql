CREATE TABLE `downtimeSummaries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reportDate` varchar(10) NOT NULL,
	`sourceReportId` int NOT NULL,
	`amExecutive` varchar(255) NOT NULL DEFAULT '',
	`pmExecutive` varchar(255) NOT NULL DEFAULT '',
	`generatedFileName` varchar(512),
	`generatedFileUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `downtimeSummaries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `downtimeSummaryEntries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`summaryId` int NOT NULL,
	`incidentKey` varchar(128) NOT NULL,
	`incidentOrder` int NOT NULL DEFAULT 0,
	`zone` varchar(32) NOT NULL DEFAULT 'Zone 1',
	`rideCode` varchar(32) NOT NULL,
	`attraction` varchar(512) NOT NULL,
	`description` text NOT NULL,
	`downtimeStart` varchar(16) NOT NULL,
	`downtimeEnd` varchar(16) NOT NULL,
	`durationMinutes` int NOT NULL,
	`shift` varchar(8) NOT NULL,
	`rootCause` text,
	`correctiveAction` text,
	`preventiveAction` text,
	`partsReplaced` text,
	`followUpAction` text,
	`anrNo` text,
	`supportInfo` text,
	`supportPhotoUrl` text,
	`supportPhotoName` varchar(512),
	`status` varchar(32) NOT NULL DEFAULT 'Monitoring',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `downtimeSummaryEntries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `downtimeSummaryImports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reportDate` varchar(10) NOT NULL,
	`fileName` varchar(512) NOT NULL,
	`fileUrl` text NOT NULL,
	`fileType` varchar(32) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `downtimeSummaryImports_id` PRIMARY KEY(`id`)
);
