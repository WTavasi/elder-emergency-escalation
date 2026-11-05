-- The service for a reported type is asked a short while after the report, so a
-- mistaken tap can be changed first. Its time is kept here as well as in Redis, so a
-- restart cannot lose it.

-- AlterTable
ALTER TABLE "emergency_events" ADD COLUMN "service_due_at" TIMESTAMPTZ(3);
