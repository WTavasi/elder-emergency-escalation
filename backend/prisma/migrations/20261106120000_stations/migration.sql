-- Responder units are stations, asked nearest first.
--
-- A responder account can say where it is based, so the nearest station by road is
-- asked first and the next nearest after a decline or no answer. The emergency keeps
-- the deadline for passing a station over, as it keeps its tier deadline, so a restart
-- cannot lose it.

-- AlterEnum
ALTER TYPE "audit_action" ADD VALUE 'STATION_ASKED';

-- AlterTable
ALTER TABLE "users" ADD COLUMN "station_label" VARCHAR(200),
ADD COLUMN "station_latitude" DECIMAL(9,6),
ADD COLUMN "station_longitude" DECIMAL(9,6);

-- AlterTable
ALTER TABLE "emergency_events" ADD COLUMN "station_deadline_at" TIMESTAMPTZ(3);
