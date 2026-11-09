-- The escalation policy editor: band thresholds an administrator can set, and a record
-- of every change made to the rules, weights and bands.

CREATE TABLE "policy_settings" (
    "key" VARCHAR(48) NOT NULL,
    "value" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by_id" UUID,

    CONSTRAINT "policy_settings_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "policy_changes" (
    "change_id" UUID NOT NULL,
    "changed_by_id" UUID,
    "area" VARCHAR(32) NOT NULL,
    "target" VARCHAR(80) NOT NULL,
    "before" JSONB,
    "after" JSONB NOT NULL,
    "changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_changes_pkey" PRIMARY KEY ("change_id")
);

CREATE INDEX "policy_changes_changed_at_idx" ON "policy_changes"("changed_at");

ALTER TABLE "policy_settings" ADD CONSTRAINT "policy_settings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "policy_changes" ADD CONSTRAINT "policy_changes_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;
