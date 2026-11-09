-- Several phones per account: a session and a push address per device. The single
-- refresh token and push token on users stay for accounts that have not refreshed since,
-- and are moved here on their next refresh.

CREATE TABLE "user_devices" (
    "device_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "refresh_token_hash" VARCHAR(64) NOT NULL,
    "push_token" VARCHAR(255),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_devices_pkey" PRIMARY KEY ("device_id")
);

CREATE UNIQUE INDEX "user_devices_push_token_key" ON "user_devices"("push_token");

CREATE INDEX "user_devices_user_id_idx" ON "user_devices"("user_id");

ALTER TABLE "user_devices" ADD CONSTRAINT "user_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
