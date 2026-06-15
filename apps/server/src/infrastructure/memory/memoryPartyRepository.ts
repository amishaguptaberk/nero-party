import type { PartyRepository, CreatePartyInput } from "../../application/ports.js";
import type { PartySnapshot, QueueItemScore, QueueItemView, Track } from "../../domain/entities.js";
import { calculateScore, chooseWinner } from "../../domain/scoring.js";

type PartyRecord = PartySnapshot & {
  createdAt: Date;
  cheersByItem: Map<string, string[]>;
};

function id(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function standingsFor(party: PartyRecord): QueueItemScore[] {
  return [...party.queue, party.currentItem].filter(Boolean).map((item) => {
    const queueItem = item as QueueItemView;
    const cheerers = party.cheersByItem.get(queueItem.id) ?? [];
    const uniqueCheerers = new Set(cheerers).size;
    return {
      queueItemId: queueItem.id,
      title: queueItem.track.title,
      artist: queueItem.track.artist,
      artworkUrl: queueItem.track.artworkUrl,
      cheers: queueItem.cheers,
      queueUpvotes: queueItem.votes,
      uniqueCheerers,
      score: calculateScore({ cheers: queueItem.cheers, queueUpvotes: queueItem.votes, uniqueCheerers }),
    };
  });
}

export class MemoryPartyRepository implements PartyRepository {
  private readonly parties = new Map<string, PartyRecord>();

  async createParty(input: CreatePartyInput & { code: string }): Promise<PartySnapshot> {
    const hostId = id("participant");
    const party: PartyRecord = {
      id: id("party"),
      code: input.code,
      name: input.name,
      hostName: input.hostName,
      maxSongs: input.maxSongs,
      maxMinutes: input.maxMinutes,
      status: "LOBBY",
      participants: [{ id: hostId, name: input.hostName, isHost: true }],
      currentItem: null,
      queue: [],
      createdAt: new Date(),
      cheersByItem: new Map(),
    };
    this.parties.set(input.code, party);
    return this.snapshot(party);
  }

  async joinParty(input: { code: string; name: string }): Promise<PartySnapshot> {
    const party = this.requireParty(input.code);
    party.participants.push({ id: id("participant"), name: input.name, isHost: false });
    return this.snapshot(party);
  }

  async getPartyByCode(code: string): Promise<PartySnapshot | null> {
    const party = this.parties.get(code);
    return party ? this.snapshot(party) : null;
  }

  async addTrackToQueue(input: { code: string; participantId: string; track: Track }): Promise<PartySnapshot> {
    const party = this.requireParty(input.code);
    if (party.queue.length >= party.maxSongs) throw new Error("Party queue is full.");

    const participant = party.participants.find((person) => person.id === input.participantId);
    const item: QueueItemView = {
      id: id("queue"),
      position: party.queue.length + 1,
      status: "QUEUED",
      addedByName: participant?.name ?? "guest",
      track: input.track,
      votes: 1,
      cheers: 0,
    };
    party.queue.push(item);
    return this.snapshot(party);
  }

  async voteForQueueItem(input: { code: string; participantId: string; queueItemId: string }): Promise<PartySnapshot> {
    const party = this.requireParty(input.code);
    const item = party.queue.find((queueItem) => queueItem.id === input.queueItemId);
    if (!item) throw new Error("Queue item not found.");
    item.votes += 1;
    party.queue.sort((a, b) => b.votes - a.votes);
    party.queue.forEach((queueItem, index) => {
      queueItem.position = index + 1;
    });
    return this.snapshot(party);
  }

  async cheerCurrentTrack(input: { code: string; participantId: string }): Promise<PartySnapshot> {
    const party = this.requireParty(input.code);
    if (!party.currentItem) throw new Error("No track is currently playing.");
    party.currentItem.cheers += 1;
    party.cheersByItem.set(party.currentItem.id, [...(party.cheersByItem.get(party.currentItem.id) ?? []), input.participantId]);
    return this.snapshot(party);
  }

  async startParty(code: string): Promise<PartySnapshot> {
    const party = this.requireParty(code);
    party.status = "LIVE";
    if (!party.currentItem) {
      party.currentItem = party.queue.shift() ?? null;
      if (party.currentItem) party.currentItem.status = "PLAYING";
    }
    return this.snapshot(party);
  }

  async advanceParty(code: string): Promise<PartySnapshot> {
    const party = this.requireParty(code);
    if (party.currentItem) party.currentItem.status = "PLAYED";
    party.currentItem = party.queue.shift() ?? null;
    if (party.currentItem) party.currentItem.status = "PLAYING";
    return this.snapshot(party);
  }

  async endParty(code: string): Promise<PartySnapshot> {
    const party = this.requireParty(code);
    party.status = "ENDED";
    const standings = standingsFor(party).sort((a, b) => b.score - a.score);
    return { ...this.snapshot(party), standings, winner: chooseWinner(standings) };
  }

  private requireParty(code: string): PartyRecord {
    const party = this.parties.get(code);
    if (!party) throw new Error("Party not found.");
    return party;
  }

  private snapshot(party: PartyRecord): PartySnapshot {
    const standings = party.status === "ENDED" ? standingsFor(party).sort((a, b) => b.score - a.score) : undefined;
    return {
      id: party.id,
      code: party.code,
      name: party.name,
      hostName: party.hostName,
      maxSongs: party.maxSongs,
      maxMinutes: party.maxMinutes,
      status: party.status,
      currentStartedAt: null,
      participants: [...party.participants],
      currentItem: party.currentItem ? { ...party.currentItem } : null,
      queue: party.queue.map((item) => ({ ...item })),
      standings,
      winner: standings ? chooseWinner(standings) : undefined,
    };
  }
}
