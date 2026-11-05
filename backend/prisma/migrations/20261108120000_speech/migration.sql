-- What an elder said after pressing help, in words, for 30 days; and its consent.

-- AlterEnum
ALTER TYPE "audit_action" ADD VALUE 'SPEECH_HEARD';

-- AlterEnum
ALTER TYPE "consent_type" ADD VALUE 'VOICE_REPORTS';

-- CreateTable
CREATE TABLE "event_speech" (
    "speech_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "transcript" VARCHAR(2000) NOT NULL,
    "english" VARCHAR(2000),
    "language" VARCHAR(8),
    "heard_type" "emergency_type",
    "applied" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_speech_pkey" PRIMARY KEY ("speech_id")
);

-- CreateIndex
CREATE INDEX "event_speech_event_id_idx" ON "event_speech"("event_id");

-- CreateIndex
CREATE INDEX "event_speech_created_at_idx" ON "event_speech"("created_at");

-- AddForeignKey
ALTER TABLE "event_speech" ADD CONSTRAINT "event_speech_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "emergency_events"("event_id") ON DELETE CASCADE ON UPDATE CASCADE;

