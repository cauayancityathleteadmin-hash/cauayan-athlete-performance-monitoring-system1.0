-- AlterTable
ALTER TABLE "users" ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "password_changed_at" TIMESTAMP(3);
