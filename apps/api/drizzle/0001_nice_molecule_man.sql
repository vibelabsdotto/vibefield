DROP INDEX `assets_hash`;--> statement-breakpoint
CREATE UNIQUE INDEX `assets_hash` ON `assets` (`sha256`);