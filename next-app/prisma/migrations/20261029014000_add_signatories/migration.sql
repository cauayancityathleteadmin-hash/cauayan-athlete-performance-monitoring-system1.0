-- CreateEnum
CREATE TYPE "SignatoryRole" AS ENUM ('prepared_by', 'reviewed_by', 'certified_by', 'noted_by');

-- CreateEnum
CREATE TYPE "SignatoryDisplay" AS ENUM ('name_position_line', 'name_position', 'designation_only', 'line_only');

-- CreateTable
CREATE TABLE "signatories" (
    "id" SERIAL NOT NULL,
    "report_type" TEXT NOT NULL,
    "role" "SignatoryRole" NOT NULL,
    "printed_name" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "office" TEXT,
    "display_mode" "SignatoryDisplay" NOT NULL DEFAULT 'name_position_line',
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "effective_from" TIMESTAMP(3),
    "effective_to" TIMESTAMP(3),
    "status" "ActiveStatus" NOT NULL DEFAULT 'active',
    "user_id" INTEGER,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "signatories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "signatories_report_type_status_display_order_idx" ON "signatories"("report_type", "status", "display_order");

-- AddForeignKey
ALTER TABLE "signatories" ADD CONSTRAINT "signatories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signatories" ADD CONSTRAINT "signatories_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
