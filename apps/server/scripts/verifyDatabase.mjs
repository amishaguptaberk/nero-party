import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  await db.$executeRawUnsafe("PRAGMA foreign_keys = ON");

  const suffix = Date.now().toString(36);
  const code = `DB${suffix.slice(-4).toUpperCase()}`;
  const providerId = `smoke-${suffix}`;

  const party = await db.party.create({
    data: {
      code,
      name: "Database Smoke Test",
      hostName: "Nero",
      maxSongs: 5,
      participants: {
        create: { name: "Nero", isHost: true },
      },
    },
    include: { participants: true },
  });

  const participant = party.participants[0];
  if (!participant) throw new Error("Participant insert failed.");

  const queueItem = await db.queueItem.create({
    data: {
      party: { connect: { id: party.id } },
      addedBy: { connect: { id: participant.id } },
      position: 1,
      track: {
        create: {
          provider: "itunes",
          providerId,
          title: "Smoke Test Track",
          artist: "Nero",
          previewUrl: "https://example.com/preview.m4a",
          durationMs: 30000,
        },
      },
      votes: {
        create: { participantId: participant.id, value: 1 },
      },
      cheers: {
        create: { participantId: participant.id },
      },
    },
    include: { votes: true, cheers: true, track: true },
  });

  if (queueItem.votes.length !== 1 || queueItem.cheers.length !== 1) {
    throw new Error("Vote or cheer relation insert failed.");
  }

  await db.party.delete({ where: { id: party.id } });

  const [participants, queueItems, votes, cheers] = await Promise.all([
    db.participant.count({ where: { partyId: party.id } }),
    db.queueItem.count({ where: { partyId: party.id } }),
    db.vote.count({ where: { queueItemId: queueItem.id } }),
    db.cheer.count({ where: { queueItemId: queueItem.id } }),
  ]);

  if (participants + queueItems + votes + cheers !== 0) {
    throw new Error("Cascade delete failed for party-owned records.");
  }

  await db.track.delete({ where: { provider_providerId: { provider: "itunes", providerId } } });

  console.log("Database verified: schema, relations, indexes, and cascades are healthy.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
