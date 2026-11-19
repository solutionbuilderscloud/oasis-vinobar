CREATE TABLE `daily_rates` (
	`day` text PRIMARY KEY NOT NULL,
	`pyg` real NOT NULL,
	`brl` real NOT NULL,
	`source` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `customers` ADD `barter_limit_cents` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sales` ADD `kind` text DEFAULT 'venda' NOT NULL;--> statement-breakpoint
ALTER TABLE `sales` ADD `note` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `sales` ADD `authorized_by` integer REFERENCES users(id);