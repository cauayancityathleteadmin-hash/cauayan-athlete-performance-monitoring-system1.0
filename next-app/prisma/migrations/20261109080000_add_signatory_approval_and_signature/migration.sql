-- Add the "Approved by" signature role.
ALTER TYPE "SignatoryRole" ADD VALUE IF NOT EXISTS 'approved_by';

-- Store an optional uploaded signature / e-signature image for a signatory.
ALTER TABLE "signatories" ADD COLUMN "signature_image_url" TEXT;
