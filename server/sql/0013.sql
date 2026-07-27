CREATE TABLE IF NOT EXISTS `feed_vector_indexes` (
	`feed_id` integer PRIMARY KEY NOT NULL,
	`content_hash` text DEFAULT '' NOT NULL,
	`chunk_count` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'idle' NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`feed_id`) REFERENCES `feeds`(`id`) ON UPDATE no action ON DELETE cascade
);
