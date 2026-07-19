CREATE TABLE `tailoring_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`tailoring_id` text NOT NULL,
	`user_id` text NOT NULL,
	`claim_path` text NOT NULL,
	`action` text NOT NULL,
	`edited_text` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tailoring_id`) REFERENCES `tailorings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tailoring_decisions_tailoring_idx` ON `tailoring_decisions` (`tailoring_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `tailoring_decisions_path_unique` ON `tailoring_decisions` (`tailoring_id`,`claim_path`);