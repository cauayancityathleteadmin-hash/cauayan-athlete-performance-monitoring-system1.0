-- AlterTable
ALTER TABLE "document_types" ADD COLUMN     "expiry_months" INTEGER,
ADD COLUMN     "has_expiry" BOOLEAN NOT NULL DEFAULT false;