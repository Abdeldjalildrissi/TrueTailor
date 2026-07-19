CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`role_title` text,
	`company` text,
	`raw_text` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `jobs_user_idx` ON `jobs` (`user_id`);--> statement-breakpoint
CREATE TABLE `tailorings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`job_id` text NOT NULL,
	`profile_version` integer NOT NULL,
	`analysis` text NOT NULL,
	`ranking` text NOT NULL,
	`result` text NOT NULL,
	`verification` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tailorings_user_idx` ON `tailorings` (`user_id`);--> statement-breakpoint
CREATE INDEX `tailorings_job_idx` ON `tailorings` (`job_id`);