import type { MusicSearchPort } from "../../application/ports.js";
import type { Track } from "../../domain/entities.js";

type ItunesTrack = {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName?: string;
  artworkUrl100?: string;
  previewUrl?: string;
  trackTimeMillis?: number;
};

export class ItunesSearchClient implements MusicSearchPort {
  async searchTracks(query: string): Promise<Track[]> {
    if (!query.trim()) return [];

    const url = new URL("https://itunes.apple.com/search");
    url.searchParams.set("term", query);
    url.searchParams.set("entity", "song");
    url.searchParams.set("media", "music");
    url.searchParams.set("limit", "12");

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`iTunes search failed with ${response.status}`);
    }

    const payload = (await response.json()) as { results: ItunesTrack[] };
    return payload.results
      .filter((item) => item.previewUrl)
      .map((item) => ({
        provider: "itunes",
        providerId: String(item.trackId),
        title: item.trackName,
        artist: item.artistName,
        album: item.collectionName,
        artworkUrl: item.artworkUrl100?.replace("100x100bb", "600x600bb") ?? null,
        previewUrl: item.previewUrl!,
        durationMs: item.trackTimeMillis ?? 30000,
      }));
  }
}

