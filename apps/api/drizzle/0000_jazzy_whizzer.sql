CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`sha256` text NOT NULL,
	`kind` text NOT NULL,
	`mime` text NOT NULL,
	`bytes` integer NOT NULL,
	`width` integer,
	`height` integer,
	`duration_ms` integer,
	`storage_key` text NOT NULL,
	`original_name` text NOT NULL,
	`source_job_id` text,
	`consent_confirmed` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`source_job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `assets_source_job` ON `assets` (`source_job_id`);--> statement-breakpoint
CREATE INDEX `assets_hash` ON `assets` (`sha256`);--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`brief` text NOT NULL,
	`product_name` text NOT NULL,
	`product_asset_ids` text NOT NULL,
	`character_ids` text NOT NULL,
	`format` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `characters` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`appearance` text NOT NULL,
	`persona` text NOT NULL,
	`status` text NOT NULL,
	`canonical_asset_id` text,
	`identity_version` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`canonical_asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `characters_slug_unique` ON `characters` (`slug`);--> statement-breakpoint
CREATE TABLE `history` (
	`id` text PRIMARY KEY NOT NULL,
	`at` text NOT NULL,
	`actor` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `history_entity` ON `history` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`idempotency_key` text NOT NULL,
	`request_hash` text NOT NULL,
	`kind` text NOT NULL,
	`purpose` text NOT NULL,
	`character_id` text,
	`campaign_id` text,
	`shot_id` text,
	`provider` text NOT NULL,
	`model_requested` text NOT NULL,
	`model_reported` text,
	`request` text NOT NULL,
	`identity_snapshot` text,
	`status` text NOT NULL,
	`provider_job_id` text,
	`output_asset_ids` text NOT NULL,
	`result_text` text,
	`result` text,
	`error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`submitted_at` text,
	`finished_at` text,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_idempotency_key_unique` ON `jobs` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `job_status` ON `jobs` (`status`);--> statement-breakpoint
CREATE INDEX `job_shot` ON `jobs` (`shot_id`);--> statement-breakpoint
CREATE INDEX `job_character` ON `jobs` (`character_id`);--> statement-breakpoint
CREATE TABLE `character_references` (
	`id` text PRIMARY KEY NOT NULL,
	`character_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`role` text NOT NULL,
	`position` integer NOT NULL,
	`approved` integer NOT NULL,
	`identity_version` integer NOT NULL,
	`source_job_id` text,
	`consent_confirmed` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reference_unique` ON `character_references` (`character_id`,`asset_id`);--> statement-breakpoint
CREATE INDEX `reference_character` ON `character_references` (`character_id`);--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`context_type` text NOT NULL,
	`context_id` text NOT NULL,
	`decision` text NOT NULL,
	`checklist` text NOT NULL,
	`notes` text NOT NULL,
	`actor` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `review_context_asset` ON `reviews` (`context_type`,`context_id`,`asset_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `shots` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`character_id` text NOT NULL,
	`position` integer NOT NULL,
	`title` text NOT NULL,
	`scene` text NOT NULL,
	`action` text NOT NULL,
	`camera` text NOT NULL,
	`lighting` text NOT NULL,
	`wardrobe` text NOT NULL,
	`dialogue` text NOT NULL,
	`motion` text NOT NULL,
	`ref_asset_ids` text NOT NULL,
	`duration_seconds` integer NOT NULL,
	`resolution` text NOT NULL,
	`selected_still_asset_id` text,
	`selected_video_asset_id` text,
	`still_identity_version` integer,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`selected_still_asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`selected_video_asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `shot_campaign_position` ON `shots` (`campaign_id`,`position`);--> statement-breakpoint
CREATE TABLE `submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`provider` text NOT NULL,
	`kind` text NOT NULL,
	`outcome` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `submissions_job_id_unique` ON `submissions` (`job_id`);