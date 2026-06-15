import type { QueueItemScore } from "./entities.js";

export function calculateScore(input: {
  cheers: number;
  queueUpvotes: number;
  uniqueCheerers: number;
}): number {
  return input.cheers * 3 + input.queueUpvotes * 2 + input.uniqueCheerers * 5;
}

export function chooseWinner(standings: QueueItemScore[]): QueueItemScore | null {
  return [...standings]
    .sort((a, b) => b.score - a.score || b.cheers - a.cheers || a.title.localeCompare(b.title))
    .at(0) ?? null;
}
