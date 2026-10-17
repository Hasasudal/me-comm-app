ALTER TABLE `posts` ADD `reviewed_at` integer;--> statement-breakpoint
UPDATE posts SET reviewed_at=updated_at WHERE category='news' AND status<>'pending';