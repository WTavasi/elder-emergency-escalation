-- Daily check-ins, opt-in. A missed one raises an alert at the standard band.

CREATE TYPE "alert_trigger" AS ENUM ('PANIC', 'MISSED_CHECK_IN');
CREATE TYPE "check_in_status" AS ENUM ('PENDING', 'ANSWERED', 'MISSED');
ALTER TYPE "audit_action" ADD VALUE 'CHECKED_IN_LATE' AFTER 'VOICE_JOINED';

ALTER TABLE "emergency_events" ADD COLUMN "trigger" "alert_trigger" NOT NULL DEFAULT 'PANIC';

CREATE TABLE "check_in_schedules" (
    "elder_id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "times" INTEGER[],
    "grace_minutes" INTEGER NOT NULL DEFAULT 30,
    "set_by_id" UUID,
    "confirmed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "check_in_schedules_pkey" PRIMARY KEY ("elder_id")
);

CREATE TABLE "check_ins" (
    "check_in_id" UUID NOT NULL,
    "elder_id" UUID NOT NULL,
    "due_at" TIMESTAMPTZ(3) NOT NULL,
    "remind_at" TIMESTAMPTZ(3) NOT NULL,
    "deadline_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "check_in_status" NOT NULL DEFAULT 'PENDING',
    "reminded_at" TIMESTAMPTZ(3),
    "answered_at" TIMESTAMPTZ(3),
    "answered_via" VARCHAR(8),
    "missed_at" TIMESTAMPTZ(3),
    "event_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "check_ins_pkey" PRIMARY KEY ("check_in_id")
);

CREATE UNIQUE INDEX "check_ins_elder_id_due_at_key" ON "check_ins"("elder_id", "due_at");
CREATE INDEX "check_ins_status_deadline_at_idx" ON "check_ins"("status", "deadline_at");

ALTER TABLE "check_in_schedules" ADD CONSTRAINT "check_in_schedules_elder_id_fkey" FOREIGN KEY ("elder_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "check_in_schedules" ADD CONSTRAINT "check_in_schedules_set_by_id_fkey" FOREIGN KEY ("set_by_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_elder_id_fkey" FOREIGN KEY ("elder_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "emergency_events"("event_id") ON DELETE SET NULL ON UPDATE CASCADE;
