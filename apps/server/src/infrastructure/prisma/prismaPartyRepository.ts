import type { PrismaClient } from "@prisma/client";
import type { CreatePartyInput, JoinResult, PartyRepository } from "../../application/ports.js";
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
    addedById: item.addedById ?? null,
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
    previewUrl: item.track.previewUrl,
    cheers,
    queueUpvotes,
    uniqueCheerers,
    score: calculateScore({ cheers, queueUpvotes, uniqueCheerers }),
  };
}

export class PrismaPartyRepository implements PartyRepository {
  constructor(private readonly db: PrismaClient) {}

  async createParty(input: CreatePartyInput & { code: string }): Promise<JoinResult> {
    const party = await this.db.party.create({
      data: {
        code: input.code,
        name: input.name,
        hostName: input.hostName,
        maxSongs: input.maxSongs,
        participants: {
          create: { name: input.hostName, isHost: true },
        },
      },
      include: partyInclude,
    });
    const host = party.participants[0];
    return { snapshot: this.toSnapshot(party), participantId: host.id };
  }

  async joinParty(input: { code: string; name: string }): Promise<JoinResult> {
    const existingParty = await this.db.party.findUnique({ where: { code: input.code }, select: { id: true } });
    if (!existingParty) throw new Error("Party not found.");

    const participant = await this.db.participant.create({
      data: { partyId: existingParty.id, name: input.name },
    });
    return { snapshot: await this.requireSnapshot(input.code), participantId: participant.id };
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

  async removeQueueItem(input: { code: string; participantId: string; queueItemId: string }): Promise<PartySnapshot> {
    const party = await this.loadParty(input.code);
    if (!party) throw new Error("Party not found.");

    const target = party.queueItems.find((item) => item.id === input.queueItemId && item.status === "QUEUED");
    if (!target) throw new Error("Queued song not found.");

    const isHost = party.participants.some((person) => person.id === input.participantId && person.isHost);
    if (target.addedById !== input.participantId && !isHost) {
      throw new Error("Only the person who added this song can remove it.");
    }

    await this.db.queueItem.delete({ where: { id: target.id } });
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

  async jumpToQueueItem(input: { code: string; queueItemId: string }): Promise<PartySnapshot> {
    const party = await this.loadParty(input.code);
    if (!party) throw new Error("Party not found.");

    const target = party.queueItems.find((item) => item.id === input.queueItemId && item.status === "QUEUED");
    if (!target) throw new Error("Queued song not found.");

    await this.db.$transaction([
      ...(party.currentItemId
        ? [
            this.db.queueItem.update({
              where: { id: party.currentItemId },
              data: { status: "PLAYED", playedAt: new Date() },
            }),
          ]
        : []),
      this.db.queueItem.update({
        where: { id: target.id },
        data: { status: "PLAYING" },
      }),
      this.db.party.update({
        where: { code: input.code },
        data: {
          status: "LIVE",
          currentItemId: target.id,
          currentStartedAt: new Date(),
        },
      }),
    ]);

    return this.requireSnapshot(input.code);
  }

  async setParticipantPresence(input: { code: string; participantId: string; present: boolean }): Promise<PartySnapshot> {
    const party = await this.loadParty(input.code);
    if (!party) throw new Error("Party not found.");
    const target = party.participants.find((person) => person.id === input.participantId);
    if (!target) return this.toSnapshot(party);

    await this.db.participant.update({
      where: { id: input.participantId },
      data: { leftAt: input.present ? null : new Date() },
    });

    // Host migration: if the host leaves, hand control to the oldest remaining active participant.
    if (!input.present && target.isHost) {
      const heir = party.participants.find((person) => person.id !== input.participantId && person.leftAt === null);
      if (heir) {
        await this.db.$transaction([
          this.db.participant.update({ where: { id: input.participantId }, data: { isHost: false } }),
          this.db.participant.update({ where: { id: heir.id }, data: { isHost: true } }),
          this.db.party.update({ where: { code: input.code }, data: { hostName: heir.name } }),
        ]);
      }
    }

    return this.requireSnapshot(input.code);
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
    const standings = party.status === "ENDED" ? party.queueItems.map(toScore).sort((a, b) => b.score - a.score) : undefined;
    return {
      id: party.id,
      code: party.code,
      name: party.name,
      hostName: party.hostName,
      maxSongs: party.maxSongs,
      status: party.status as PartyStatus,
      currentStartedAt: party.currentStartedAt?.toISOString() ?? null,
      participants: party.participants
        .filter((participant) => participant.leftAt === null)
        .map((participant) => ({
          id: participant.id,
          name: participant.name,
          isHost: participant.isHost,
        })),
      currentItem,
      queue: party.queueItems.filter((item) => item.status === "QUEUED").map(toQueueItem),
      standings,
      winner: standings ? chooseWinner(standings) : undefined,
    };
  }
}
