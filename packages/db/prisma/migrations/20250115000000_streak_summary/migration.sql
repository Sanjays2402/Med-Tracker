-- Add streak summary cache table

CREATE TABLE "StreakSummary" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "medicationId" TEXT NOT NULL UNIQUE,
  "currentDays" INTEGER NOT NULL DEFAULT 0,
  "longestDays" INTEGER NOT NULL DEFAULT 0,
  "lastTakenAt" DATETIME,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("medicationId") REFERENCES "Medication"("id") ON DELETE CASCADE
);
