-- CreateTable
CREATE TABLE "fitness_norms" (
    "id" SERIAL NOT NULL,
    "fitnessType" "FitnessDimension" NOT NULL,
    "sex" TEXT NOT NULL,
    "age_group" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "value" DECIMAL(65,30) NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "source_note" TEXT,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fitness_norms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fitness_norms_fitnessType_sex_age_group_tier_key" ON "fitness_norms"("fitnessType", "sex", "age_group", "tier");
