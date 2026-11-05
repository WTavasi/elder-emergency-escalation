-- Volunteers are chosen by road distance when a router answers.
--
-- A volunteer's call now says whether its distance was measured along roads or is the
-- straight line, so the volunteer and the circle can be told which. Calls made before
-- this were all straight lines.

-- AlterTable
ALTER TABLE "volunteer_calls" ADD COLUMN "by_road" BOOLEAN NOT NULL DEFAULT false;
