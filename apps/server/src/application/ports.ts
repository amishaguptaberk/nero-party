import type { PartySnapshot, Track } from "../domain/entities.js";

export type CreatePartyInput = {
  name: string;
  hostName: string;
  maxSongs: number;
  maxMinutes: number;
};

export type PartyRepository = {
  createParty(input: CreatePartyInput & { code: string }): Promise<PartySnapshot>;
  joinParty(input: { code: string; name: string }): Promise<PartySnapshot>;
  getPartyByCode(code: string): Promise<PartySnapshot | null>;
  addTrackToQueue(input: { code: string; participantId: string; track: Track }): Promise<PartySnapshot>;
  voteForQueueItem(input: { code: string; participantId: string; queueItemId: string }): Promise<PartySnapshot>;
  cheerCurrentTrack(input: { code: string; participantId: string }): Promise<PartySnapshot>;
  startParty(code: string): Promise<PartySnapshot>;
  advanceParty(code: string): Promise<PartySnapshot>;
  jumpToQueueItem(input: { code: string; queueItemId: string }): Promise<PartySnapshot>;
  endParty(code: string): Promise<PartySnapshot>;
};

export type MusicSearchPort = {
  searchTracks(query: string): Promise<Track[]>;
};

export type PartyEvents = {
  publishPartySnapshot(code: string, snapshot: PartySnapshot): void;
};
