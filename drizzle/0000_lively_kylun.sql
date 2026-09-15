CREATE TABLE `attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_attempts_expiry` ON `attempts` (`expires_at`);--> statement-breakpoint
CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`password_hash` text NOT NULL,
	`salt` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_posts_status_created` ON `posts` (`status`,`created_at`);