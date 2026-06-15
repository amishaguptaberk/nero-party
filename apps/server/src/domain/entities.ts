export type PartyStatus = "LOBBY" | "LIVE" | "ENDED";
export type QueueStatus = "QUEUED" | "PLAYING" | "PLAYED" | "SKIPPED";

export type Track = {
  id?: string;
  provider: "itunes";
  providerId: string;
  title: string;
  artist: string;
  album?: string | null;
  artworkUrl?: string | null;
  previewUrl: string;
  durationMs?: number | null;
};

export type Participant = {
  id: string;
  name: string;
  isHost: boolean;
};

export type QueueItemScore = {
  queueItemId: string;
  title: string;
  artist: string;
  artworkUrl?: string | null;
  previewUrl?: string | null;
  cheers: number;
  queueUpvotes: number;
  uniqueCheerers: number;
  score: number;
};

export type PartySnapshot = {
  id: string;
  code: string;
  name: string;
  hostName: string;
  maxSongs: number;
  status: PartyStatus;
  currentStartedAt?: string | null;
  participants: Participant[];
  currentItem?: QueueItemView | null;
  queue: QueueItemView[];
  standings?: QueueItemScore[];
  winner?: QueueItemScore | null;
};

export type QueueItemView = {
  id: string;
  position: number;
  status: QueueStatus;
  addedById?: string | null;
  addedByName?: string | null;
  track: Track;
  votes: number;
  cheers: number;
};
