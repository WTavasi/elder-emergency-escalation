-- AlterTable
ALTER TABLE "users" ADD COLUMN "current_latitude" DECIMAL(9,6);
ALTER TABLE "users" ADD COLUMN "current_longitude" DECIMAL(9,6);
ALTER TABLE "users" ADD COLUMN "current_place_label" VARCHAR(200);
ALTER TABLE "users" ADD COLUMN "current_place_set_at" TIMESTAMPTZ(3);
ALTER TABLE "users" ADD COLUMN "current_place_set_by_id" UUID;
