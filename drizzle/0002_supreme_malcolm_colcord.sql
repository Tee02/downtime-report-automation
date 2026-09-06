CREATE TABLE `darkDays` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dateKey` varchar(10) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `darkDays_id` PRIMARY KEY(`id`),
	CONSTRAINT `darkDays_dateKey_unique` UNIQUE(`dateKey`)
);
--> statement-breakpoint
ALTER TABLE `savedDowntimeReports` ADD `weatherText` text;