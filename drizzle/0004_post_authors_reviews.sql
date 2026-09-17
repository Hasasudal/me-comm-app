ALTER TABLE `posts` ADD `author_id` text;--> statement-breakpoint
ALTER TABLE `posts` ADD `author_name` text;--> statement-breakpoint
ALTER TABLE `posts` ADD `prefix` text;--> statement-breakpoint
ALTER TABLE `posts` ADD `feedback` text;--> statement-breakpoint
CREATE INDEX `idx_posts_author` ON `posts` (`author_id`,`created_at`);