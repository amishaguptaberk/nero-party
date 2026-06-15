import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateScore, chooseWinner } from "./scoring.js";
import type { QueueItemScore } from "./entities.js";

function score(overrides: Partial<Pick<QueueItemScore, "title" | "cheers" | "queueUpvotes" | "uniqueCheerers" | "score">>): QueueItemScore {
  const cheers = overrides.cheers ?? 0;
  const queueUpvotes = overrides.queueUpvotes ?? 0;
  const uniqueCheerers = overrides.uniqueCheerers ?? 0;
  return {
    queueItemId: overrides.title ?? "id",
    title: overrides.title ?? "Song",
    artist: "Artist",
    cheers,
    queueUpvotes,
    uniqueCheerers,
    score: overrides.score ?? calculateScore({ cheers, queueUpvotes, uniqueCheerers }),
  };
}

test("breadth beats volume: a room-wide song outscores one fan hammering cheer", () => {
  const hammeredByOneFan = calculateScore({ cheers: 8, queueUpvotes: 0, uniqueCheerers: 1 }); // 8*3 + 5 = 29
  const lovedByFivePeople = calculateScore({ cheers: 5, queueUpvotes: 0, uniqueCheerers: 5 }); // 5*3 + 25 = 40
  assert.ok(lovedByFivePeople > hammeredByOneFan, "unique cheerers must outweigh raw cheer spam");
});

test("each signal carries its intended weight (unique 5 > cheer 3 > upvote 2)", () => {
  assert.equal(calculateScore({ cheers: 0, queueUpvotes: 1, uniqueCheerers: 0 }), 2);
  assert.equal(calculateScore({ cheers: 1, queueUpvotes: 0, uniqueCheerers: 0 }), 3);
  assert.equal(calculateScore({ cheers: 0, queueUpvotes: 0, uniqueCheerers: 1 }), 5);
});

test("upvotes contribute but do not dominate cheers + unique reach", () => {
  const upvotesOnly = calculateScore({ cheers: 0, queueUpvotes: 10, uniqueCheerers: 0 }); // 20
  const cheeredAndShared = calculateScore({ cheers: 3, queueUpvotes: 0, uniqueCheerers: 3 }); // 9 + 15 = 24
  assert.ok(cheeredAndShared > upvotesOnly, "anticipation alone should not beat real in-room love");
});

test("winner selection is deterministic on ties", () => {
  // Equal score → higher cheers wins.
  const byCheers = chooseWinner([
    score({ title: "Quiet", cheers: 1, uniqueCheerers: 3, score: 18 }),
    score({ title: "Loud", cheers: 6, uniqueCheerers: 0, score: 18 }),
  ]);
  assert.equal(byCheers?.title, "Loud");

  // Equal score and cheers → alphabetical title (stable, deterministic).
  const byTitle = chooseWinner([
    score({ title: "Bravo", cheers: 2, score: 10 }),
    score({ title: "Alpha", cheers: 2, score: 10 }),
  ]);
  assert.equal(byTitle?.title, "Alpha");

  assert.equal(chooseWinner([]), null);
});
