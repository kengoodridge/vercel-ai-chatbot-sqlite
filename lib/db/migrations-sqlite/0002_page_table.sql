CREATE TABLE IF NOT EXISTS `Page` (
	`id` text PRIMARY KEY NOT NULL,
	`path` text NOT NULL,
	`htmlContent` text NOT NULL,
	`projectId` text NOT NULL,
	`userId` text NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`projectId`) REFERENCES `Project`(`id`) ON UPDATE no action ON DELETE CASCADE,
	FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON UPDATE no action ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `Page_path_unique` ON `Page`(`path`);