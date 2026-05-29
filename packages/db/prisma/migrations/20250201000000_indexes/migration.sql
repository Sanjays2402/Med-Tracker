-- Index for fast notification unread lookups

CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");
CREATE INDEX "CaregiverShare_userId_idx" ON "CaregiverShare"("userId");
