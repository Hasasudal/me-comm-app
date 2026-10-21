CREATE TABLE `newsletter_deliveries` (
	`newsletter_id` text NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`sent_at` integer,
	PRIMARY KEY(`newsletter_id`, `user_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_newsletter_deliveries_status` ON `newsletter_deliveries` (`newsletter_id`,`status`);--> statement-breakpoint
CREATE TABLE `newsletters` (
	`id` text PRIMARY KEY NOT NULL,
	`subject` text NOT NULL,
	`html` text NOT NULL,
	`created_by` text NOT NULL,
	`created_by_name` text NOT NULL,
	`created_at` integer NOT NULL,
	`sent_at` integer
);
--> statement-breakpoint
ALTER TABLE `users` ADD `newsletter` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `newsletter_token` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_newsletter_token` ON `users` (`newsletter_token`);