ALTER TABLE `users` ADD `role` text DEFAULT 'member' NOT NULL;--> statement-breakpoint
-- Active administrators keep their rights as the new "admin" role.
UPDATE `users` SET `role` = 'admin' WHERE `id` IN (SELECT `user_id` FROM `admin_users` WHERE `revoked_at` IS NULL);--> statement-breakpoint
DROP TABLE `admin_users`;
