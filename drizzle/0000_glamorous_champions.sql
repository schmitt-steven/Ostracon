CREATE TABLE "links" (
	"from_id" uuid NOT NULL,
	"to_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"content_md" text NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_from_id_notes_id_fk" FOREIGN KEY ("from_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "links" ADD CONSTRAINT "links_to_id_notes_id_fk" FOREIGN KEY ("to_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "links_from_to_idx" ON "links" USING btree ("from_id","to_id");--> statement-breakpoint
CREATE INDEX "links_to_id_idx" ON "links" USING btree ("to_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notes_slug_idx" ON "notes" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "notes_tags_gin_idx" ON "notes" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "notes_updated_at_idx" ON "notes" USING btree ("updated_at");