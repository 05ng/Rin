CREATE TABLE `rendered_pages` (
    `path` text PRIMARY KEY NOT NULL,
    `html` text NOT NULL,
    `created_at` integer DEFAULT (unixepoch()) NOT NULL
);
