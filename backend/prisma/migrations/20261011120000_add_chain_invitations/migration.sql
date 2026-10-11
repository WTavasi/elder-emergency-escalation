-- CreateTable
CREATE TABLE "chain_invitations" (
    "invitation_id" UUID NOT NULL,
    "elderly_id" UUID NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "name" VARCHAR(120),
    "priority_order" SMALLINT NOT NULL,
    "invited_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chain_invitations_pkey" PRIMARY KEY ("invitation_id")
);

-- CreateIndex
CREATE INDEX "chain_invitations_phone_idx" ON "chain_invitations"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "chain_invitations_elderly_id_phone_key" ON "chain_invitations"("elderly_id", "phone");

-- AddForeignKey
ALTER TABLE "chain_invitations" ADD CONSTRAINT "chain_invitations_elderly_id_fkey" FOREIGN KEY ("elderly_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chain_invitations" ADD CONSTRAINT "chain_invitations_invited_by_id_fkey" FOREIGN KEY ("invited_by_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
