import type { CreatePartyInput, MusicSearchPort, PartyEvents, PartyRepository } from "./ports.js";

function makePartyCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

const FALLBACK_SEEDS = ["top hits", "dua lipa", "the weeknd", "fleetwood mac", "tame impala", "daft punk"];

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function createPartyUseCases(deps: {
  parties: PartyRepository;
  music: MusicSearchPort;
  events: PartyEvents;
}) {
  async function createParty(input: CreatePartyInput) {
    return deps.parties.createParty({ ...input, code: makePartyCode() });
  }

  async function joinParty(input: { code: string; name: string }) {
    const snapshot = await deps.parties.joinParty(input);
    deps.events.publishPartySnapshot(input.code, snapshot);
    return snapshot;
  }

  async function getParty(code: string) {
    return deps.parties.getPartyByCode(code);
  }

  async function searchTracks(query: string) {
    return deps.music.searchTracks(query);
  }

  async function addTrack(input: { code: string; participantId: string; queryTrack: Awaited<ReturnType<MusicSearchPort["searchTracks"]>>[number] }) {
    const snapshot = await deps.parties.addTrackToQueue({
      code: input.code,
      participantId: input.participantId,
      track: input.queryTrack,
    });
    deps.events.publishPartySnapshot(input.code, snapshot);
    return snapshot;
  }

  async function vote(input: { code: string; participantId: string; queueItemId: string }) {
    const snapshot = await deps.parties.voteForQueueItem(input);
    deps.events.publishPartySnapshot(input.code, snapshot);
    return snapshot;
  }

  async function cheer(input: { code: string; participantId: string }) {
    const snapshot = await deps.parties.cheerCurrentTrack(input);
    deps.events.publishPartySnapshot(input.code, snapshot);
    return snapshot;
  }

  async function autoShuffleIfEmpty(code: string) {
    const current = await deps.parties.getPartyByCode(code);
    if (!current || current.queue.length > 0) return;
    const host = current.participants.find((p) => p.isHost) ?? current.participants[0];
    if (!host) return;
    try {
      const seed = FALLBACK_SEEDS[Math.floor(Math.random() * FALLBACK_SEEDS.length)];
      const results = await deps.music.searchTracks(seed);
      const picks = shuffle(results.filter((track) => track.previewUrl)).slice(0, Math.min(5, current.maxSongs));
      for (const track of picks) {
        await deps.parties.addTrackToQueue({ code, participantId: host.id, track });
      }
    } catch {
      // best-effort: if search is unavailable, start with whatever is queued
    }
  }

  async function start(code: string) {
    await autoShuffleIfEmpty(code);
    const snapshot = await deps.parties.startParty(code);
    deps.events.publishPartySnapshot(code, snapshot);
    return snapshot;
  }

  async function advance(code: string) {
    const snapshot = await deps.parties.advanceParty(code);
    deps.events.publishPartySnapshot(code, snapshot);
    return snapshot;
  }

  async function jump(input: { code: string; queueItemId: string }) {
    const snapshot = await deps.parties.jumpToQueueItem(input);
    deps.events.publishPartySnapshot(input.code, snapshot);
    return snapshot;
  }

  async function end(code: string) {
    const snapshot = await deps.parties.endParty(code);
    deps.events.publishPartySnapshot(code, snapshot);
    return snapshot;
  }

  return { createParty, joinParty, getParty, searchTracks, addTrack, vote, cheer, start, advance, jump, end };
}

export type PartyUseCases = ReturnType<typeof createPartyUseCases>;
