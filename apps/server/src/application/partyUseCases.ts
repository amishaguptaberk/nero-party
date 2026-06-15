import type { CreatePartyInput, MusicSearchPort, PartyEvents, PartyRepository } from "./ports.js";

function makePartyCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
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

  async function searchTracks(query: string) {
    return deps.music.searchTracks(query);
  }

  async function addTrack(input: { code: string; participantId: string; providerId: string; queryTrack: Awaited<ReturnType<MusicSearchPort["searchTracks"]>>[number] }) {
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

  async function start(code: string) {
    const snapshot = await deps.parties.startParty(code);
    deps.events.publishPartySnapshot(code, snapshot);
    return snapshot;
  }

  async function advance(code: string) {
    const snapshot = await deps.parties.advanceParty(code);
    deps.events.publishPartySnapshot(code, snapshot);
    return snapshot;
  }

  async function end(code: string) {
    const snapshot = await deps.parties.endParty(code);
    deps.events.publishPartySnapshot(code, snapshot);
    return snapshot;
  }

  return { createParty, joinParty, searchTracks, addTrack, vote, cheer, start, advance, end };
}

export type PartyUseCases = ReturnType<typeof createPartyUseCases>;

