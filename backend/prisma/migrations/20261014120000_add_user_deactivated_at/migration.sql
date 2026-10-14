-- An administrator can deactivate an account instead of deleting it. Null means active.
ALTER TABLE "users" ADD COLUMN "deactivated_at" TIMESTAMPTZ(3);
