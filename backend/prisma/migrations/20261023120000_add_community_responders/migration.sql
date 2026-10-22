-- Community volunteers: a role, a consent, their applications, and who was asked about
-- which emergency.

ALTER TYPE "role" ADD VALUE 'COMMUNITY_RESPONDER';
ALTER TYPE "consent_type" ADD VALUE 'COMMUNITY_HELP';
ALTER TYPE "audit_action" ADD VALUE 'VOLUNTEERS_ASKED' AFTER 'CHECKED_IN_LATE';
ALTER TYPE "audit_action" ADD VALUE 'VOLUNTEER_ACCEPTED' AFTER 'VOLUNTEERS_ASKED';
ALTER TYPE "audit_action" ADD VALUE 'VOLUNTEER_WITHDREW' AFTER 'VOLUNTEER_ACCEPTED';
ALTER TYPE "audit_action" ADD VALUE 'VOLUNTEER_ARRIVED' AFTER 'VOLUNTEER_WITHDREW';

CREATE TYPE "volunteer_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');
CREATE TYPE "volunteer_training" AS ENUM ('FIRST_AID', 'CPR', 'COMMUNITY_HEALTH_PROMOTER', 'HEALTH_PROFESSIONAL', 'OTHER');
CREATE TYPE "volunteer_call_status" AS ENUM ('ASKED', 'ACCEPTED', 'DECLINED', 'STOOD_DOWN', 'WITHDRAWN');

ALTER TABLE "emergency_events"
  ADD COLUMN "volunteers_asked_at" TIMESTAMPTZ(3),
  ADD COLUMN "volunteer_id" UUID,
  ADD COLUMN "volunteer_accepted_at" TIMESTAMPTZ(3),
  ADD COLUMN "volunteer_arrived_at" TIMESTAMPTZ(3);

CREATE TABLE "volunteer_profiles" (
    "user_id" UUID NOT NULL,
    "status" "volunteer_status" NOT NULL DEFAULT 'PENDING',
    "training" "volunteer_training"[],
    "note" VARCHAR(300),
    "available" BOOLEAN NOT NULL DEFAULT false,
    "available_changed_at" TIMESTAMPTZ(3),
    "applied_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMPTZ(3),
    "reviewed_by_id" UUID,
    "review_note" VARCHAR(300),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "volunteer_profiles_pkey" PRIMARY KEY ("user_id")
);

CREATE TABLE "volunteer_calls" (
    "volunteer_call_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "volunteer_id" UUID NOT NULL,
    "distance_metres" INTEGER NOT NULL,
    "status" "volunteer_call_status" NOT NULL DEFAULT 'ASKED',
    "asked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "asked_via" VARCHAR(8) NOT NULL,
    "responded_at" TIMESTAMPTZ(3),
    "arrived_at" TIMESTAMPTZ(3),

    CONSTRAINT "volunteer_calls_pkey" PRIMARY KEY ("volunteer_call_id")
);

CREATE INDEX "volunteer_profiles_status_available_idx" ON "volunteer_profiles"("status", "available");
CREATE UNIQUE INDEX "volunteer_calls_event_id_volunteer_id_key" ON "volunteer_calls"("event_id", "volunteer_id");
CREATE INDEX "volunteer_calls_volunteer_id_asked_at_idx" ON "volunteer_calls"("volunteer_id", "asked_at");

ALTER TABLE "emergency_events" ADD CONSTRAINT "emergency_events_volunteer_id_fkey" FOREIGN KEY ("volunteer_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "volunteer_profiles" ADD CONSTRAINT "volunteer_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "volunteer_profiles" ADD CONSTRAINT "volunteer_profiles_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "volunteer_calls" ADD CONSTRAINT "volunteer_calls_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "emergency_events"("event_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "volunteer_calls" ADD CONSTRAINT "volunteer_calls_volunteer_id_fkey" FOREIGN KEY ("volunteer_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
