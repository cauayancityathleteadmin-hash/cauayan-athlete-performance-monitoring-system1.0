-- Additive migration: finalized official reports with frozen snapshots.
-- New enum + new table only; no existing table or column is altered.

CREATE TYPE "ReportSubjectType" AS ENUM ('athlete', 'coach');

CREATE TABLE "report_documents" (
    "id" SERIAL NOT NULL,
    "reference" TEXT NOT NULL,
    "report_type" TEXT NOT NULL,
    "subject_type" "ReportSubjectType" NOT NULL,
    "subject_id" INTEGER NOT NULL,
    "subject_code" TEXT NOT NULL,
    "subject_name" TEXT NOT NULL,
    "period_from" TIMESTAMP(3),
    "period_to" TIMESTAMP(3),
    "period_label" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "signature_rows" JSONB NOT NULL,
    "generated_by" TEXT NOT NULL,
    "prepared_by_id" INTEGER,
    "prepared_by_name" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "finalized_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_documents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "report_documents_reference_key" ON "report_documents"("reference");
CREATE INDEX "report_documents_subject_type_subject_id_finalized_at_idx" ON "report_documents"("subject_type", "subject_id", "finalized_at");
CREATE INDEX "report_documents_finalized_at_idx" ON "report_documents"("finalized_at");
