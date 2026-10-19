-- When an emergency's severity was scored the second time, after its cancel window
-- closed. Null until then.
ALTER TABLE "emergency_events" ADD COLUMN "severity_reviewed_at" TIMESTAMPTZ(3);

-- Existing emergencies are marked as already reviewed. Without this, the first sweep
-- after deploying would re-score every open emergency in the database at once, and
-- could send further notifications about alerts raised long before the change.
UPDATE "emergency_events" SET "severity_reviewed_at" = "triggered_at";
