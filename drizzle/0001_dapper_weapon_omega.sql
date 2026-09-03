CREATE TABLE `savedDowntimeReports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reportDate` varchar(10) NOT NULL,
	`sourceFileName` varchar(512) NOT NULL,
	`sourceFileUrl` text NOT NULL,
	`outputFileName` varchar(512) NOT NULL,
	`outputFileUrl` text NOT NULL,
	`totalTechnicalMinutes` int NOT NULL,
	`totalNetworkPercentage` double NOT NULL,
	`weatherIntervalCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `savedDowntimeReports_id` PRIMARY KEY(`id`)
);
