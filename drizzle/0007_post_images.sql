CREATE TABLE `images` (
	`key` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`post_id` text,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_images_post` ON `images` (`post_id`,`position`);