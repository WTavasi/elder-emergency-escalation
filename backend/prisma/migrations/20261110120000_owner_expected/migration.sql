-- When the person who took an alert on said, by text, they would be there.

-- AlterTable
ALTER TABLE "emergency_events" ADD COLUMN     "owner_expected_at" TIMESTAMPTZ(3);

