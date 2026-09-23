CREATE TABLE `clubs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`requested_by` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_clubs_name` ON `clubs` (`name`);--> statement-breakpoint
ALTER TABLE `posts` ADD `club_id` text;--> statement-breakpoint
CREATE INDEX `idx_posts_club` ON `posts` (`club_id`,`created_at`);