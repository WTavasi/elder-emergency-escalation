-- AlterEnum
ALTER TYPE "event_outcome" ADD VALUE 'OTHER';

-- AlterTable
ALTER TABLE "emergency_events" ADD COLUMN "outcome_note" VARCHAR(300);
