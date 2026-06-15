import type { PartySnapshot, Track } from "./types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(error?.message ?? "Request failed.");
  }

  return response.json() as Promise<T>;
}

export const api = {
  createParty(input: { name: string; hostName: string; maxSongs: number; maxMinutes: number }) {
    return request<PartySnapshot>("/api/parties", { method: "POST", body: JSON.stringify(input) });
  },
  joinParty(code: string, name: string) {
    return request<PartySnapshot>(`/api/parties/${code}/join`, { method: "POST", body: JSON.stringify({ name }) });
  },
  getParty(code: string) {
    return request<PartySnapshot>(`/api/parties/${code}`);
  },
  searchTracks(query: string) {
    return request<Track[]>(`/api/music/search?q=${encodeURIComponent(query)}`);
  },
  addTrack(code: string, participantId: string, track: Track) {
    return request<PartySnapshot>(`/api/parties/${code}/queue`, { method: "POST", body: JSON.stringify({ participantId, track }) });
  },
  vote(code: string, participantId: string, queueItemId: string) {
    return request<PartySnapshot>(`/api/parties/${code}/vote`, { method: "POST", body: JSON.stringify({ participantId, queueItemId }) });
  },
  cheer(code: string, participantId: string) {
    return request<PartySnapshot>(`/api/parties/${code}/cheer`, { method: "POST", body: JSON.stringify({ participantId }) });
  },
  start(code: string) {
    return request<PartySnapshot>(`/api/parties/${code}/start`, { method: "POST" });
  },
  advance(code: string) {
    return request<PartySnapshot>(`/api/parties/${code}/advance`, { method: "POST" });
  },
  jump(code: string, queueItemId: string) {
    return request<PartySnapshot>(`/api/parties/${code}/jump`, { method: "POST", body: JSON.stringify({ queueItemId }) });
  },
  end(code: string) {
    return request<PartySnapshot>(`/api/parties/${code}/end`, { method: "POST" });
  },
};

export { API_URL };
