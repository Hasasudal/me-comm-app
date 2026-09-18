CREATE TABLE `member_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`target_id` text NOT NULL,
	`target_name` text NOT NULL,
	`target_email` text NOT NULL,
	`action` text NOT NULL,
	`before` text NOT NULL,
	`after` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_member_audit_created` ON `member_audit` (`created_at`);