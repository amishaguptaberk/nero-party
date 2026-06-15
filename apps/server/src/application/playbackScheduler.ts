import type { PartySnapshot } from "../domain/entities.js";
import type { PartyUseCases } from "./partyUseCases.js";

type TimerState = {
  itemId: string;
  timeout: NodeJS.Timeout;
};

const MAX_PREVIEW_MS = 30_000;

export function createPlaybackScheduler(getUseCases: () => PartyUseCases) {
  const timers = new Map<string, TimerState>();

  function clear(code: string) {
    const existing = timers.get(code);
    if (existing) clearTimeout(existing.timeout);
    timers.delete(code);
  }

  function schedule(code: string, snapshot: PartySnapshot) {
    if (snapshot.status !== "LIVE" || !snapshot.currentItem || !snapshot.currentStartedAt) {
      clear(code);
      return;
    }

    const existing = timers.get(code);
    if (existing?.itemId === snapshot.currentItem.id) return;

    clear(code);

    const durationMs = Math.min(snapshot.currentItem.track.durationMs ?? MAX_PREVIEW_MS, MAX_PREVIEW_MS);
    const elapsedMs = Date.now() - new Date(snapshot.currentStartedAt).getTime();
    const delay = Math.max(500, durationMs - elapsedMs);

    const timeout = setTimeout(async () => {
      try {
        const next = await getUseCases().advance(code);
        if (next.status === "LIVE" && !next.currentItem && next.queue.length === 0) {
          await getUseCases().end(code);
        }
      } catch (error) {
        console.error(`Playback advance failed for ${code}`, error);
        clear(code);
      }
    }, delay);

    timers.set(code, { itemId: snapshot.currentItem.id, timeout });
  }

  return { schedule, clear };
}

