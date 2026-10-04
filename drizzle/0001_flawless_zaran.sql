CREATE TABLE `subtitles` (
	`room_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`revision` integer NOT NULL,
	`cues_json` text NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
