-- AlterTable
ALTER TABLE "users" ADD COLUMN     "refresh_token_hash" VARCHAR(64),
ADD COLUMN     "refresh_token_updated_at" TIMESTAMPTZ(3);
