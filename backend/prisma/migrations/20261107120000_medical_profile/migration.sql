-- An elder's medical details, sealed, with who changed them and who opened them.
-- Kept only while the elder's MEDICAL_PROFILE consent stands.

-- AlterEnum
ALTER TYPE "consent_type" ADD VALUE 'MEDICAL_PROFILE';

-- CreateTable
CREATE TABLE "medical_profiles" (
    "elderly_id" UUID NOT NULL,
    "sealed" TEXT NOT NULL,
    "updated_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "medical_profiles_pkey" PRIMARY KEY ("elderly_id")
);

-- CreateTable
CREATE TABLE "medical_profile_changes" (
    "change_id" UUID NOT NULL,
    "elderly_id" UUID NOT NULL,
    "changed_by_id" UUID,
    "fields" TEXT[],
    "changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medical_profile_changes_pkey" PRIMARY KEY ("change_id")
);

-- CreateTable
CREATE TABLE "medical_profile_views" (
    "view_id" UUID NOT NULL,
    "elderly_id" UUID NOT NULL,
    "viewer_id" UUID,
    "event_id" UUID,
    "viewed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medical_profile_views_pkey" PRIMARY KEY ("view_id")
);

-- CreateIndex
CREATE INDEX "medical_profile_changes_elderly_id_changed_at_idx" ON "medical_profile_changes"("elderly_id", "changed_at");

-- CreateIndex
CREATE INDEX "medical_profile_views_elderly_id_viewed_at_idx" ON "medical_profile_views"("elderly_id", "viewed_at");

-- CreateIndex
CREATE INDEX "medical_profile_views_event_id_idx" ON "medical_profile_views"("event_id");

-- AddForeignKey
ALTER TABLE "medical_profiles" ADD CONSTRAINT "medical_profiles_elderly_id_fkey" FOREIGN KEY ("elderly_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_profile_changes" ADD CONSTRAINT "medical_profile_changes_elderly_id_fkey" FOREIGN KEY ("elderly_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_profile_changes" ADD CONSTRAINT "medical_profile_changes_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_profile_views" ADD CONSTRAINT "medical_profile_views_elderly_id_fkey" FOREIGN KEY ("elderly_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_profile_views" ADD CONSTRAINT "medical_profile_views_viewer_id_fkey" FOREIGN KEY ("viewer_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_profile_views" ADD CONSTRAINT "medical_profile_views_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "emergency_events"("event_id") ON DELETE SET NULL ON UPDATE CASCADE;

