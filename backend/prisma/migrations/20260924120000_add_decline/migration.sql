-- AlterEnum
ALTER TYPE "audit_action" ADD VALUE 'DECLINED';

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN "declined_at" TIMESTAMPTZ(3);
