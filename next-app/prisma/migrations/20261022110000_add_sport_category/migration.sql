-- CreateEnum
CREATE TYPE "SportCategory" AS ENUM ('individual', 'team', 'racket', 'combat', 'aquatics', 'dance');

-- AlterTable
ALTER TABLE "sports" ADD COLUMN     "category" "SportCategory" NOT NULL DEFAULT 'individual';
