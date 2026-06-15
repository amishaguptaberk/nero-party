export type Track = {
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

export type QueueItem = {
  id: string;
  position: number;
  status: "QUEUED" | "PLAYING" | "PLAYED" | "SKIPPED";
  addedByName?: string | null;
  track: Track;
  votes: number;
  cheers: number;
};

export type Score = {
  queueItemId: string;
  title: string;
  artist: string;
  artworkUrl?: string | null;
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
  maxMinutes: number;
  status: "LOBBY" | "LIVE" | "ENDED";
  currentStartedAt?: string | null;
  participants: Participant[];
  currentItem?: QueueItem | null;
  queue: QueueItem[];
  standings?: Score[];
  winner?: Score | null;
};

