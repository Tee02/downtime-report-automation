CREATE TABLE `pmTrackerLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`logDate` varchar(10) NOT NULL,
	`zone` varchar(16) NOT NULL,
	`rideCode` varchar(32) NOT NULL,
	`rideName` varchar(512) NOT NULL,
	`status` varchar(16) NOT NULL DEFAULT 'Completed',
	`workType` varchar(64) NOT NULL,
	`technician` varchar(255) NOT NULL DEFAULT '',
	`summary` varchar(512) NOT NULL DEFAULT '',
	`message` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `pmTrackerLogs_id` PRIMARY KEY(`id`)
);
