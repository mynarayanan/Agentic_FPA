CREATE TABLE "approval_event" (
	"recommendation_id" text NOT NULL,
	"n" integer NOT NULL,
	"revision" integer NOT NULL,
	"type" text NOT NULL,
	"actor_id" text NOT NULL,
	"actor_role" text NOT NULL,
	"from_state" text,
	"to_state" text NOT NULL,
	"amount_inr" bigint NOT NULL,
	"justification" text,
	"requested_by" text,
	"at" text NOT NULL,
	"prev_hash" text NOT NULL,
	"hash" text NOT NULL,
	CONSTRAINT "approval_event_recommendation_id_n_pk" PRIMARY KEY("recommendation_id","n")
);
--> statement-breakpoint
CREATE TABLE "recommendation" (
	"id" text PRIMARY KEY NOT NULL,
	"period" text NOT NULL,
	"scope" text NOT NULL,
	"action_id" text NOT NULL,
	"title" text NOT NULL,
	"owner_role" text NOT NULL,
	"status" text NOT NULL,
	"revision" integer NOT NULL,
	"amount_inr" bigint NOT NULL,
	"proposed_by" text NOT NULL,
	"requested_by" text,
	"assessment" jsonb NOT NULL,
	"evidence" jsonb NOT NULL,
	"source" jsonb NOT NULL,
	"created_at" text NOT NULL,
	CONSTRAINT "recommendation_period_scope_action" UNIQUE("period","scope","action_id")
);
--> statement-breakpoint
ALTER TABLE "approval_event" ADD CONSTRAINT "approval_event_recommendation_id_recommendation_id_fk" FOREIGN KEY ("recommendation_id") REFERENCES "public"."recommendation"("id") ON DELETE no action ON UPDATE no action;