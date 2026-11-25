-- Away for a while: told about an alert, but not waited for.
ALTER TABLE "users" ADD COLUMN "away_since" TIMESTAMPTZ(3),
ADD COLUMN "away_until" TIMESTAMPTZ(3);

ALTER TABLE "notifications" ADD COLUMN "informed_only" BOOLEAN NOT NULL DEFAULT false;
