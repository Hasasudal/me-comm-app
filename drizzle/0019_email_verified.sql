ALTER TABLE `users` ADD `email_verified_at` integer;--> statement-breakpoint
UPDATE `users` SET `email_verified_at`=`created_at` WHERE `status`='active' AND `id` NOT IN (SELECT `target_id` FROM `member_audit` WHERE `action`='status' AND `before`='pending' AND `after`='active');
