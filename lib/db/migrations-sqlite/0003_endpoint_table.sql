CREATE TABLE IF NOT EXISTS `Endpoint` (
	`id` text PRIMARY KEY NOT NULL,
	`path` text NOT NULL,
	`parameters` text,
	`code` text NOT NULL,
	`httpMethod` text DEFAULT 'GET' NOT NULL,
	`projectId` text NOT NULL,
	`userId` text NOT NULL,
	`createdAt` integer NOT NULL,
	`language` text DEFAULT 'javascript' NOT NULL,
	FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `Endpoint_path_unique` ON `Endpoint`(`path`);