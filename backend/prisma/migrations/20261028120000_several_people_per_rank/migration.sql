-- Several people may share a rank in one elder's chain, so a family of three can all be
-- the family contact, asked together. Dispatch already told everybody at a rank; only
-- this rule stood in the way. Kept as a plain index for dispatch's lookup by rank.
DROP INDEX "care_assignments_elderly_id_priority_order_key";

CREATE INDEX "care_assignments_elderly_id_priority_order_idx" ON "care_assignments"("elderly_id", "priority_order");
