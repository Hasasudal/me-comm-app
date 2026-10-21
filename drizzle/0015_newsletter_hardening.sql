ALTER TABLE `newsletters` ADD `started_by` text;--> statement-breakpoint
ALTER TABLE `newsletters` ADD `started_by_name` text;--> statement-breakpoint
ALTER TABLE `newsletters` ADD `started_at` integer;--> statement-breakpoint
ALTER TABLE `newsletter_deliveries` DROP COLUMN `email`;--> statement-breakpoint
-- Unverified sign-ups waiting for approval start unsubscribed (see lib/member-auth.ts).
UPDATE `users` SET `newsletter`=0 WHERE `status`='pending';