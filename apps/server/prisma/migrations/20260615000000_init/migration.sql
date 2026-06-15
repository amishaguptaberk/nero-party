PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS "Party" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "hostName" TEXT NOT NULL,
  "maxSongs" INTEGER NOT NULL,
  "maxMinutes" INTEGER NOT NULL,
  "songMode" TEXT NOT NULL DEFAULT 'PREVIEW_30',
  "status" TEXT NOT NULL DEFAULT 'LOBBY',
  "currentItemId" TEXT,
  "currentStartedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" DATETIME
);

CREATE TABLE IF NOT EXISTS "Participant" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "partyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isHost" BOOLEAN NOT NULL DEFAULT false,
  "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Participant_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Track" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "provider" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "artist" TEXT NOT NULL,
  "album" TEXT,
  "artworkUrl" TEXT,
  "previewUrl" TEXT NOT NULL,
  "durationMs" INTEGER,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "QueueItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "partyId" TEXT NOT NULL,
  "trackId" TEXT NOT NULL,
  "addedById" TEXT,
  "position" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "playedAt" DATETIME,
  CONSTRAINT "QueueItem_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "QueueItem_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "QueueItem_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "Participant" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Vote" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "queueItemId" TEXT NOT NULL,
  "participantId" TEXT NOT NULL,
  "value" INTEGER NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Vote_queueItemId_fkey" FOREIGN KEY ("queueItemId") REFERENCES "QueueItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Vote_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Cheer" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "queueItemId" TEXT NOT NULL,
  "participantId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Cheer_queueItemId_fkey" FOREIGN KEY ("queueItemId") REFERENCES "QueueItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Cheer_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "Party_code_key" ON "Party" ("code");
CREATE UNIQUE INDEX IF NOT EXISTS "Track_provider_providerId_key" ON "Track" ("provider", "providerId");
CREATE UNIQUE INDEX IF NOT EXISTS "Vote_queueItemId_participantId_key" ON "Vote" ("queueItemId", "participantId");
CREATE INDEX IF NOT EXISTS "Participant_partyId_idx" ON "Participant" ("partyId");
CREATE INDEX IF NOT EXISTS "QueueItem_partyId_position_idx" ON "QueueItem" ("partyId", "position");
CREATE INDEX IF NOT EXISTS "Cheer_queueItemId_idx" ON "Cheer" ("queueItemId");

