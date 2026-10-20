-- Phase 1: the person who took an emergency on can share their way there, and the
-- emergency records when they arrived.

-- A new state between owned and closed. Added after ACKNOWLEDGED so the enum reads in
-- lifecycle order. ADD VALUE cannot be used in the same transaction that adds it, and
-- nothing below uses it.
ALTER TYPE "event_state" ADD VALUE 'ON_SCENE' AFTER 'ACKNOWLEDGED';
ALTER TYPE "audit_action" ADD VALUE 'ARRIVED' AFTER 'RESPONDER_REQUESTED';

-- When the owner reached the elder. Only the time: positions shared on the way are
-- kept in Redis for minutes and never written here.
ALTER TABLE "emergency_events" ADD COLUMN "arrived_at" TIMESTAMPTZ(3);

-- One row per person, created the first time they change a choice.
CREATE TABLE "user_preferences" (
    "user_id" UUID NOT NULL,
    "share_way_there" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("user_id")
);

ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
