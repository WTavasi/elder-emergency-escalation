-- Check-ins every so often within a window, and the weekly look at each elder's rhythm.

-- AlterTable
ALTER TABLE "check_in_schedules" ADD COLUMN     "interval_minutes" SMALLINT,
ADD COLUMN     "rhythm_checked_at" TIMESTAMPTZ(3),
ADD COLUMN     "window_end" SMALLINT,
ADD COLUMN     "window_start" SMALLINT;

