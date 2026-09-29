CREATE TABLE "tag_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"pinned" text[] DEFAULT '{}'::text[] NOT NULL,
	"hues" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"pin_order" text[] DEFAULT '{}'::text[] NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
