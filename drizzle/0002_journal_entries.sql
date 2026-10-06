ALTER TABLE "notes" ADD COLUMN "journal_entry_date" date;--> statement-breakpoint
CREATE UNIQUE INDEX "notes_journal_entry_date_idx" ON "notes" USING btree ("journal_entry_date");