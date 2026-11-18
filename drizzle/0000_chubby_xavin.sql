CREATE TABLE `categories` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`description` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_categories_name` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`sku` varchar(64) NOT NULL,
	`name` varchar(200) NOT NULL,
	`description` text,
	`category_id` bigint unsigned NOT NULL,
	`low_stock_threshold` int NOT NULL DEFAULT 5,
	`stock_qty` int NOT NULL DEFAULT 0,
	`archived_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `products_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_products_sku` UNIQUE(`sku`)
);
--> statement-breakpoint
CREATE TABLE `refresh_tokens` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`user_id` bigint unsigned NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`revoked_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `refresh_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_refresh_tokens_hash` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `stock_movements` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`product_id` bigint unsigned NOT NULL,
	`movement_type` enum('IN','OUT') NOT NULL,
	`quantity` int NOT NULL,
	`note` varchar(500),
	`created_by` bigint unsigned NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stock_movements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`email` varchar(255) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`role` enum('admin','staff') NOT NULL DEFAULT 'staff',
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_users_email` UNIQUE(`email`)
);
--> statement-breakpoint
ALTER TABLE `products` ADD CONSTRAINT `products_category_id_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `refresh_tokens` ADD CONSTRAINT `refresh_tokens_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_product_id_products_id_fk` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_products_category_id` ON `products` (`category_id`);--> statement-breakpoint
CREATE INDEX `idx_products_archived_at` ON `products` (`archived_at`);--> statement-breakpoint
CREATE INDEX `idx_refresh_tokens_user_id` ON `refresh_tokens` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_movements_product_created` ON `stock_movements` (`product_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_movements_created_at` ON `stock_movements` (`created_at`);