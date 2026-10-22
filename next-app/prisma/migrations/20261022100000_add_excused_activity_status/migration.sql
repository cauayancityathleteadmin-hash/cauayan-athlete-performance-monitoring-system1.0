-- CreateEnum
CREATE TYPE "ExcuseReason" AS ENUM ('rest', 'sick', 'injured', 'excused');

-- AlterEnum
ALTER TYPE "ActivityStatus" ADD VALUE 'excused';

-- AlterTable
ALTER TABLE "plan_activity_logs" ADD COLUMN     "excuse_reason" "ExcuseReason";

