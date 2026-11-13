CREATE TABLE `card_news` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`size` integer NOT NULL,
	`author_id` text,
	`author_name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_card_news_created` ON `card_news` (`created_at`);
