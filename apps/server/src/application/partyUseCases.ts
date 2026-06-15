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

type SeedTrack = { album?: string | null; artist: string };

// Pick up to `count` tracks while keeping albums varied, so a shuffle is never
// dominated by a single album. Caps each album to ~half the picks, and only
// allows the cap to be exceeded when there aren't enough distinct albums.
function pickDiverse<T extends SeedTrack>(candidates: T[], count: number): T[] {
  const albumKey = (track: T) => `${(track.album ?? "").toLowerCase()}::${track.artist.toLowerCase()}`;
  const perAlbumCap = Math.max(1, Math.floor(count / 2));
  const counts = new Map<string, number>();
  const picks: T[] = [];
  // First pass respects the per-album cap; second pass backfills if needed.
  for (const allowOverCap of [false, true]) {
    for (const track of candidates) {
      if (picks.length >= count) break;
      if (picks.includes(track)) continue;
      const key = albumKey(track);
      const used = counts.get(key) ?? 0;
      if (!allowOverCap && used >= perAlbumCap) continue;
      counts.set(key, used + 1);
      picks.push(track);
    }
  }
  return picks;
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
    const result = await deps.parties.joinParty(input);
    deps.events.publishPartySnapshot(input.code, result.snapshot);
    deps.events.publishSystemMessage(input.code, `${input.name} joined the party`);
    return result;
  }

  async function setPresence(input: { code: string; participantId: string; present: boolean }) {
    const before = await deps.parties.getPartyByCode(input.code);
    const wasPresent = before?.participants.some((person) => person.id === input.participantId) ?? false;
    // Skip no-op churn (e.g. a reconnect for someone who never left, or a double leave).
    if (wasPresent === input.present) return;
    const person = before?.participants.find((p) => p.id === input.participantId);
    const wasHost = Boolean(person?.isHost);
    const snapshot = await deps.parties.setParticipantPresence(input);
    deps.events.publishPartySnapshot(input.code, snapshot);
    if (person) {
      deps.events.publishSystemMessage(input.code, `${person.name} ${input.present ? "is back" : "left the party"}`);
      const newHost = wasHost && !input.present ? snapshot.participants.find((p) => p.isHost) : null;
      if (newHost) deps.events.publishSystemMessage(input.code, `${newHost.name} is hosting now`);
    }
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
    const adder = snapshot.participants.find((person) => person.id === input.participantId);
    deps.events.publishSystemMessage(input.code, `${adder?.name ?? "someone"} added ${input.queryTrack.title}`);
    return snapshot;
  }

  async function vote(input: { code: string; participantId: string; queueItemId: string }) {
    const snapshot = await deps.parties.voteForQueueItem(input);
    deps.events.publishPartySnapshot(input.code, snapshot);
    return snapshot;
  }

  async function removeTrack(input: { code: string; participantId: string; queueItemId: string }) {
    const before = await deps.parties.getPartyByCode(input.code);
    const item = before?.queue.find((entry) => entry.id === input.queueItemId);
    const remover = before?.participants.find((person) => person.id === input.participantId);
    const snapshot = await deps.parties.removeQueueItem(input);
    deps.events.publishPartySnapshot(input.code, snapshot);
    if (item) {
      deps.events.publishSystemMessage(input.code, `${remover?.name ?? "someone"} removed ${item.track.title}`);
    }
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
      const count = Math.min(5, current.maxSongs);
      // Pull from a few different seeds so the candidate pool spans multiple
      // artists/albums rather than one album's tracklist.
      const seeds = shuffle(FALLBACK_SEEDS).slice(0, 3);
      const resultGroups = await Promise.all(seeds.map((seed) => deps.music.searchTracks(seed).catch(() => [])));
      const seen = new Set<string>();
      const candidates = shuffle(
        resultGroups.flat().filter((track) => {
          if (!track.previewUrl || seen.has(track.providerId)) return false;
          seen.add(track.providerId);
          return true;
        }),
      );
      const picks = pickDiverse(candidates, count);
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

  return { createParty, joinParty, getParty, searchTracks, addTrack, vote, removeTrack, cheer, start, advance, jump, end, setPresence };
}

export type PartyUseCases = ReturnType<typeof createPartyUseCases>;
