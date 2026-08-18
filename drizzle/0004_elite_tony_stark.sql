ALTER TABLE "notes" ADD COLUMN "pinned_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "notes_pinned_at_idx" ON "notes" USING btree ("pinned_at");