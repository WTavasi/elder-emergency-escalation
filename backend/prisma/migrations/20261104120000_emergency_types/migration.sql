-- What is happening, and which service it needs.
--
-- An elder, or somebody helping, can say what kind of emergency it is. Each type has a
-- lowest severity, a service (ambulance, fire, police), and whether that service is asked
-- at once beside the family or at the chain's own responder step. Responder accounts get
-- a service; every responder made before this is GENERAL, which takes any call.

-- CreateEnum
CREATE TYPE "emergency_type" AS ENUM ('FALL', 'BREATHING', 'UNWELL', 'FIRE', 'UNSAFE');

-- CreateEnum
CREATE TYPE "responder_service" AS ENUM ('GENERAL', 'AMBULANCE', 'FIRE', 'POLICE');

-- CreateEnum
CREATE TYPE "type_dispatch" AS ENUM ('IMMEDIATE', 'AT_RESPONDER_TIER');

-- AlterEnum


ALTER TYPE "audit_action" ADD VALUE 'TYPE_REPORTED';
ALTER TYPE "audit_action" ADD VALUE 'SERVICE_DISPATCHED';

-- AlterTable
ALTER TABLE "emergency_events" ADD COLUMN     "confirmed_type" "emergency_type",
ADD COLUMN     "reported_type" "emergency_type",
ADD COLUMN     "reported_type_at" TIMESTAMPTZ(3),
ADD COLUMN     "reported_type_via" VARCHAR(16),
ADD COLUMN     "service_requested" "responder_service",
ADD COLUMN     "service_requested_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "responder_service" "responder_service";

-- CreateTable
CREATE TABLE "emergency_type_rules" (
    "type" "emergency_type" NOT NULL,
    "service" "responder_service" NOT NULL,
    "severity_floor" "severity" NOT NULL,
    "dispatch" "type_dispatch" NOT NULL DEFAULT 'AT_RESPONDER_TIER',
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "emergency_type_rules_pkey" PRIMARY KEY ("type")
);


-- Every responder made before services existed takes any call.
UPDATE "users" SET "responder_service" = 'GENERAL' WHERE "role" = 'EMERGENCY_RESPONDER';

-- The rules, as data. Chest or breathing, fire and not being safe ask their service at
-- once; a fall or feeling unwell asks the ambulance at the usual responder step, because
-- the family often handles those. No type can lower severity: these are floors.
INSERT INTO "emergency_type_rules" ("type", "service", "severity_floor", "dispatch", "updated_at") VALUES
  ('BREATHING', 'AMBULANCE', 'CRITICAL', 'IMMEDIATE', CURRENT_TIMESTAMP),
  ('FIRE', 'FIRE', 'CRITICAL', 'IMMEDIATE', CURRENT_TIMESTAMP),
  ('UNSAFE', 'POLICE', 'CRITICAL', 'IMMEDIATE', CURRENT_TIMESTAMP),
  ('FALL', 'AMBULANCE', 'ELEVATED', 'AT_RESPONDER_TIER', CURRENT_TIMESTAMP),
  ('UNWELL', 'AMBULANCE', 'ELEVATED', 'AT_RESPONDER_TIER', CURRENT_TIMESTAMP);
