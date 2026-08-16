CREATE TABLE "login_attempts" (
	"ip" text PRIMARY KEY NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"last_failure_at" timestamp with time zone DEFAULT now() NOT NULL
);
