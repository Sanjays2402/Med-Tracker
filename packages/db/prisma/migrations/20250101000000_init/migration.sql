-- Initial migration. Generated to match prisma/schema.prisma for SQLite.

CREATE TABLE "User" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "email" TEXT NOT NULL UNIQUE,
  "passwordHash" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "locale" TEXT NOT NULL DEFAULT 'en',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Preferences" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL UNIQUE,
  "theme" TEXT NOT NULL DEFAULT 'system',
  "reminderLeadMinutes" INTEGER NOT NULL DEFAULT 5,
  "quietHoursStart" TEXT NOT NULL DEFAULT '22:00',
  "quietHoursEnd" TEXT NOT NULL DEFAULT '07:00',
  "caregiverShareEnabled" BOOLEAN NOT NULL DEFAULT 0,
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE TABLE "Medication" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "drugId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "strength" TEXT NOT NULL,
  "form" TEXT NOT NULL,
  "instructions" TEXT,
  "startDate" DATETIME NOT NULL,
  "endDate" DATETIME,
  "active" BOOLEAN NOT NULL DEFAULT 1,
  "supplyRemaining" INTEGER NOT NULL DEFAULT 0,
  "dosesPerRefill" INTEGER NOT NULL DEFAULT 30,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE TABLE "Schedule" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "medicationId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "times" TEXT NOT NULL DEFAULT '[]',
  "daysOfWeek" TEXT,
  "intervalHours" INTEGER,
  "cronExpression" TEXT,
  "startsAt" DATETIME NOT NULL,
  "endsAt" DATETIME,
  "enabled" BOOLEAN NOT NULL DEFAULT 1,
  FOREIGN KEY ("medicationId") REFERENCES "Medication"("id") ON DELETE CASCADE
);

CREATE TABLE "Dose" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "medicationId" TEXT NOT NULL,
  "scheduleId" TEXT NOT NULL,
  "dueAt" DATETIME NOT NULL,
  "takenAt" DATETIME,
  "status" TEXT NOT NULL DEFAULT 'scheduled',
  "note" TEXT,
  FOREIGN KEY ("medicationId") REFERENCES "Medication"("id") ON DELETE CASCADE,
  FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE CASCADE
);
CREATE INDEX "Dose_medicationId_dueAt_idx" ON "Dose"("medicationId", "dueAt");

CREATE TABLE "Refill" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "medicationId" TEXT NOT NULL,
  "filledAt" DATETIME NOT NULL,
  "quantity" INTEGER NOT NULL,
  "pharmacy" TEXT,
  "prescriber" TEXT,
  "cost" REAL,
  FOREIGN KEY ("medicationId") REFERENCES "Medication"("id") ON DELETE CASCADE
);

CREATE TABLE "CaregiverShare" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "label" TEXT NOT NULL,
  "scopes" TEXT NOT NULL DEFAULT '["view-meds"]',
  "expiresAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE TABLE "Notification" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "sentAt" DATETIME,
  "readAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
