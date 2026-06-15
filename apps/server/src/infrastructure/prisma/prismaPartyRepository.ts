import type { PrismaClient } from "@prisma/client";
import type { CreatePartyInput, PartyRepository } from "../../application/ports.js";
import type { PartySnapshot, PartyStatus, QueueItemScore, QueueItemView, QueueStatus, Track } from "../../domain/entities.js";
import { calculateScore, chooseWinner } from "../../domain/scoring.js";

const partyInclude = {
  participants: { orderBy: { joinedAt: "asc" as const } },
  queueItems: {
    include: {
      track: true,
      addedBy: true,
      votes: true,
      cheers: true,
    },
    orderBy: [{ position: "asc" as const }, { playedAt: "asc" as const }],
  },
};

type PartyWithRelations = NonNullable<Awaited<ReturnType<PrismaPartyRepository["loadParty"]>>>;
type QueueItemWithRelations = PartyWithRelations["queueItems"][number];

function toTrack(track: QueueItemWithRelations["track"]): Track {
  return {
    id: track.id,
    provider: "itunes",
    providerId: track.providerId,
    title: track.title,
    artist: track.artist,
    album: track.album,
    artworkUrl: track.artworkUrl,
    previewUrl: track.previewUrl,
    durationMs: track.durationMs,
  };
}

function toQueueItem(item: QueueItemWithRelations): QueueItemView {
  return {
    id: item.id,
    position: item.position,
    status: item.status as QueueStatus,
    addedByName: item.addedBy?.name ?? null,
    track: toTrack(item.track),
    votes: item.votes.reduce((total, vote) => total + vote.value, 0),
    cheers: item.cheers.length,
  };
}

function toScore(item: QueueItemWithRelations): QueueItemScore {
  const cheers = item.cheers.length;
  const queueUpvotes = item.votes.reduce((total, vote) => total + vote.value, 0);
  const uniqueCheerers = new Set(item.cheers.map((cheer) => cheer.participantId)).size;
  return {
    queueItemId: item.id,
    title: item.track.title,
    artist: item.track.artist,
    artworkUrl: item.track.artworkUrl,
    cheers,
    queueUpvotes,
    uniqueCheerers,
    score: calculateScore({ cheers, queueUpvotes, uniqueCheerers }),
  };
}

export class PrismaPartyRepository implements PartyRepository {
  constructor(private readonly db: PrismaClient) {}

  async createParty(input: CreatePartyInput & { code: string }): Promise<PartySnapshot> {
    const party = await this.db.party.create({
      data: {
        code: input.code,
        name: input.name,
        hostName: input.hostName,
        maxSongs: input.maxSongs,
        maxMinutes: input.maxMinutes,
        participants: {
          create: { name: input.hostName, isHost: true },
        },
      },
      include: partyInclude,
    });
    return this.toSnapshot(party);
  }

  async joinParty(input: { code: string; name: string }): Promise<PartySnapshot> {
    const party = await this.db.party.update({
      where: { code: input.code },
      data: {
        participants: {
          create: { name: input.name },
        },
      },
      include: partyInclude,
    });
    return this.toSnapshot(party);
  }

  async getPartyByCode(code: string): Promise<PartySnapshot | null> {
    const party = await this.loadParty(code);
    return party ? this.toSnapshot(party) : null;
  }

  async addTrackToQueue(input: { code: string; participantId: string; track: Track }): Promise<PartySnapshot> {
    const party = await this.loadParty(input.code);
    if (!party) throw new Error("Party not found.");
    if (party.queueItems.length >= party.maxSongs) throw new Error("Party queue is full.");

    const position = Math.max(0, ...party.queueItems.map((item) => item.position)) + 1;

    await this.db.queueItem.create({
      data: {
        party: { connect: { id: party.id } },
        addedBy: { connect: { id: input.participantId } },
        position,
        track: {
          connectOrCreate: {
            where: { provider_providerId: { provider: input.track.provider, providerId: input.track.providerId } },
            create: {
              provider: input.track.provider,
              providerId: input.track.providerId,
              title: input.track.title,
              artist: input.track.artist,
              album: input.track.album,
              artworkUrl: input.track.artworkUrl,
              previewUrl: input.track.previewUrl,
              durationMs: input.track.durationMs,
            },
          },
        },
        votes: {
          create: { participantId: input.participantId, value: 1 },
        },
      },
    });

    return this.requireSnapshot(input.code);
  }

  async voteForQueueItem(input: { code: string; participantId: string; queueItemId: string }): Promise<PartySnapshot> {
    await this.db.vote.upsert({
      where: { queueItemId_participantId: { queueItemId: input.queueItemId, participantId: input.participantId } },
      update: { value: { increment: 1 } },
      create: { queueItemId: input.queueItemId, participantId: input.participantId, value: 1 },
    });

    await this.reorderQueuedItems(input.code);
    return this.requireSnapshot(input.code);
  }

  async cheerCurrentTrack(input: { code: string; participantId: string }): Promise<PartySnapshot> {
    const party = await this.db.party.findUnique({ where: { code: input.code }, select: { currentItemId: true } });
    if (!party?.currentItemId) throw new Error("No track is currently playing.");

    await this.db.cheer.create({
      data: {
        queueItemId: party.currentItemId,
        participantId: input.participantId,
      },
    });

    return this.requireSnapshot(input.code);
  }

  async startParty(code: string): Promise<PartySnapshot> {
    const party = await this.loadParty(code);
    if (!party) throw new Error("Party not found.");
    const nextItem = party.queueItems.find((item) => item.status === "QUEUED");

    await this.db.party.update({
      where: { code },
      data: {
        status: "LIVE",
        currentStartedAt: nextItem ? new Date() : null,
        currentItemId: nextItem?.id ?? null,
      },
    });

    if (nextItem) {
      await this.db.queueItem.update({ where: { id: nextItem.id }, data: { status: "PLAYING" } });
    }

    return this.requireSnapshot(code);
  }

  async advanceParty(code: string): Promise<PartySnapshot> {
    const party = await this.loadParty(code);
    if (!party) throw new Error("Party not found.");

    if (party.currentItemId) {
      await this.db.queueItem.update({
        where: { id: party.currentItemId },
        data: { status: "PLAYED", playedAt: new Date() },
      });
    }

    const nextItem = party.queueItems.find((item) => item.status === "QUEUED");
    await this.db.party.update({
      where: { code },
      data: {
        currentItemId: nextItem?.id ?? null,
        currentStartedAt: nextItem ? new Date() : null,
      },
    });

    if (nextItem) {
      await this.db.queueItem.update({ where: { id: nextItem.id }, data: { status: "PLAYING" } });
    }

    return this.requireSnapshot(code);
  }

  async endParty(code: string): Promise<PartySnapshot> {
    await this.db.party.update({
      where: { code },
      data: { status: "ENDED", endedAt: new Date() },
    });

    const party = await this.loadParty(code);
    if (!party) throw new Error("Party not found.");

    const standings = party.queueItems.map(toScore).sort((a, b) => b.score - a.score);
    return { ...this.toSnapshot(party), standings, winner: chooseWinner(standings) };
  }

  async loadParty(code: string) {
    return this.db.party.findUnique({ where: { code }, include: partyInclude });
  }

  private async requireSnapshot(code: string): Promise<PartySnapshot> {
    const party = await this.loadParty(code);
    if (!party) throw new Error("Party not found.");
    return this.toSnapshot(party);
  }

  private async reorderQueuedItems(code: string) {
    const party = await this.loadParty(code);
    if (!party) throw new Error("Party not found.");

    const queued = party.queueItems
      .filter((item) => item.status === "QUEUED")
      .map((item) => ({ id: item.id, votes: item.votes.reduce((total, vote) => total + vote.value, 0) }))
      .sort((a, b) => b.votes - a.votes);

    await this.db.$transaction(
      queued.map((item, index) =>
        this.db.queueItem.update({
          where: { id: item.id },
          data: { position: index + 1 },
        }),
      ),
    );
  }

  private toSnapshot(party: PartyWithRelations): PartySnapshot {
    const current = party.queueItems.find((item) => item.id === party.currentItemId) ?? null;
    const currentItem = current ? toQueueItem(current) : null;
    return {
      id: party.id,
      code: party.code,
      name: party.name,
      hostName: party.hostName,
      maxSongs: party.maxSongs,
      maxMinutes: party.maxMinutes,
      status: party.status as PartyStatus,
      participants: party.participants.map((participant) => ({
        id: participant.id,
        name: participant.name,
        isHost: participant.isHost,
      })),
      currentItem,
      queue: party.queueItems.filter((item) => item.status === "QUEUED").map(toQueueItem),
    };
  }
}
