CREATE TABLE `members` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`name` text NOT NULL,
	`is_host` integer DEFAULT 0 NOT NULL,
	`last_seen` integer NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_members_room_seen` ON `members` (`room_id`,`last_seen`);--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`host_name` text NOT NULL,
	`host_hash` text NOT NULL,
	`drive_id` text NOT NULL,
	`resource_key` text,
	`video_name` text NOT NULL,
	`playing` integer DEFAULT 0 NOT NULL,
	`position` real DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL
);
