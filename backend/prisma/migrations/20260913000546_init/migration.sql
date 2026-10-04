-- CreateEnum
CREATE TYPE "role" AS ENUM ('ELDER', 'CAREGIVER', 'FAMILY_MEMBER', 'EMERGENCY_RESPONDER', 'ADMINISTRATOR');

-- CreateEnum
CREATE TYPE "care_level" AS ENUM ('INDEPENDENT', 'ASSISTED', 'HIGH_DEPENDENCY');

-- CreateEnum
CREATE TYPE "event_state" AS ENUM ('TRIGGERED', 'NOTIFIED', 'ACKNOWLEDGED', 'ESCALATED', 'RESOLVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "severity" AS ENUM ('STANDARD', 'ELEVATED', 'CRITICAL');

-- CreateEnum
CREATE TYPE "event_outcome" AS ENUM ('FALSE_ALARM', 'CANCELLED_BY_ELDER', 'HANDLED_AT_HOME', 'RESPONDER_ATTENDED', 'HOSPITAL_TRANSFER', 'NO_RESPONSE');

-- CreateEnum
CREATE TYPE "notification_channel" AS ENUM ('PUSH', 'SMS');

-- CreateEnum
CREATE TYPE "notification_status" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'ACKNOWLEDGED');

-- CreateEnum
CREATE TYPE "dispatch_mode" AS ENUM ('SEQUENTIAL', 'PARALLEL');

-- CreateEnum
CREATE TYPE "audit_action" AS ENUM ('EVENT_CREATED', 'SEVERITY_EVALUATED', 'TIER_DISPATCHED', 'NOTIFICATION_FAILED', 'ACKNOWLEDGED', 'ESCALATED', 'RESPONDER_REQUESTED', 'RESOLVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "consent_type" AS ENUM ('DATA_PROCESSING', 'LOCATION_SHARING', 'CONTACT_SHARING');

-- CreateTable
CREATE TABLE "users" (
    "user_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "email" VARCHAR(160),
    "role" "role" NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Africa/Nairobi',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "push_token" VARCHAR(255),
    "push_token_updated_at" TIMESTAMPTZ(3),
    "care_level" "care_level",
    "home_latitude" DECIMAL(9,6),
    "home_longitude" DECIMAL(9,6),
    "home_address_label" VARCHAR(200),
    "coverage_area_name" VARCHAR(120),
    "coverage_latitude" DECIMAL(9,6),
    "coverage_longitude" DECIMAL(9,6),
    "coverage_radius_km" DECIMAL(6,2),

    CONSTRAINT "users_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "care_assignments" (
    "assignment_id" UUID NOT NULL,
    "elderly_id" UUID NOT NULL,
    "responder_id" UUID NOT NULL,
    "priority_order" SMALLINT NOT NULL,
    "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cover_days_of_week" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "cover_start_minute" SMALLINT,
    "cover_end_minute" SMALLINT,

    CONSTRAINT "care_assignments_pkey" PRIMARY KEY ("assignment_id")
);

-- CreateTable
CREATE TABLE "emergency_events" (
    "event_id" UUID NOT NULL,
    "elderly_id" UUID NOT NULL,
    "acknowledged_by" UUID,
    "alert_latitude" DECIMAL(9,6) NOT NULL,
    "alert_longitude" DECIMAL(9,6) NOT NULL,
    "alert_address_label" VARCHAR(200),
    "responder_latitude" DECIMAL(9,6),
    "responder_longitude" DECIMAL(9,6),
    "state" "event_state" NOT NULL DEFAULT 'TRIGGERED',
    "current_tier" SMALLINT NOT NULL DEFAULT 1,
    "outcome" "event_outcome",
    "severity" "severity" NOT NULL DEFAULT 'STANDARD',
    "severity_score" SMALLINT NOT NULL DEFAULT 0,
    "severity_factors" JSONB,
    "responder_requested_at" TIMESTAMPTZ(3),
    "triggered_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged_at" TIMESTAMPTZ(3),
    "resolved_at" TIMESTAMPTZ(3),

    CONSTRAINT "emergency_events_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "escalation_rules" (
    "rule_id" UUID NOT NULL,
    "severity" "severity" NOT NULL,
    "tier_order" SMALLINT NOT NULL,
    "responder_role" "role" NOT NULL,
    "timeout_seconds" INTEGER,
    "dispatch_mode" "dispatch_mode" NOT NULL DEFAULT 'SEQUENTIAL',
    "sms_fallback_immediate" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "escalation_rules_pkey" PRIMARY KEY ("rule_id")
);

-- CreateTable
CREATE TABLE "severity_factors" (
    "key" VARCHAR(48) NOT NULL,
    "label" VARCHAR(160) NOT NULL,
    "weight" SMALLINT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "description" VARCHAR(400),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "severity_factors_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "notifications" (
    "notification_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "channel" "notification_channel" NOT NULL,
    "status" "notification_status" NOT NULL DEFAULT 'QUEUED',
    "tier" SMALLINT NOT NULL,
    "sent_at" TIMESTAMPTZ(3),
    "delivered_at" TIMESTAMPTZ(3),
    "acknowledged_at" TIMESTAMPTZ(3),
    "provider_message_id" VARCHAR(160),
    "failure_reason" VARCHAR(400),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("notification_id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "log_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "actor_id" UUID,
    "action" "audit_action" NOT NULL,
    "previous_state" "event_state",
    "new_state" "event_state",
    "detail" JSONB,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("log_id")
);

-- CreateTable
CREATE TABLE "consent_records" (
    "consent_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "granted_by_id" UUID NOT NULL,
    "type" "consent_type" NOT NULL,
    "granted" BOOLEAN NOT NULL DEFAULT true,
    "policy_version" VARCHAR(20) NOT NULL,
    "grantor_relationship" VARCHAR(60) NOT NULL,
    "granted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawn_at" TIMESTAMPTZ(3),

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("consent_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "care_assignments_responder_id_idx" ON "care_assignments"("responder_id");

-- CreateIndex
CREATE UNIQUE INDEX "care_assignments_elderly_id_priority_order_key" ON "care_assignments"("elderly_id", "priority_order");

-- CreateIndex
CREATE UNIQUE INDEX "care_assignments_elderly_id_responder_id_key" ON "care_assignments"("elderly_id", "responder_id");

-- CreateIndex
CREATE INDEX "emergency_events_state_idx" ON "emergency_events"("state");

-- CreateIndex
CREATE INDEX "emergency_events_elderly_id_triggered_at_idx" ON "emergency_events"("elderly_id", "triggered_at");

-- CreateIndex
CREATE INDEX "emergency_events_triggered_at_idx" ON "emergency_events"("triggered_at");

-- CreateIndex
CREATE UNIQUE INDEX "escalation_rules_severity_tier_order_key" ON "escalation_rules"("severity", "tier_order");

-- CreateIndex
CREATE INDEX "notifications_event_id_idx" ON "notifications"("event_id");

-- CreateIndex
CREATE INDEX "notifications_recipient_id_created_at_idx" ON "notifications"("recipient_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_status_idx" ON "notifications"("status");

-- CreateIndex
CREATE INDEX "audit_logs_event_id_occurred_at_idx" ON "audit_logs"("event_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_logs_occurred_at_idx" ON "audit_logs"("occurred_at");

-- CreateIndex
CREATE INDEX "consent_records_subject_id_type_idx" ON "consent_records"("subject_id", "type");

-- AddForeignKey
ALTER TABLE "care_assignments" ADD CONSTRAINT "care_assignments_elderly_id_fkey" FOREIGN KEY ("elderly_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_assignments" ADD CONSTRAINT "care_assignments_responder_id_fkey" FOREIGN KEY ("responder_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emergency_events" ADD CONSTRAINT "emergency_events_elderly_id_fkey" FOREIGN KEY ("elderly_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emergency_events" ADD CONSTRAINT "emergency_events_acknowledged_by_fkey" FOREIGN KEY ("acknowledged_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "emergency_events"("event_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "emergency_events"("event_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_granted_by_id_fkey" FOREIGN KEY ("granted_by_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
