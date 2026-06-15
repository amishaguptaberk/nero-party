# Nero Party

Throw a listening party with your friends. You start a room, share a code, everyone drops songs into a shared queue, people cheer what's playing, and at the end one track gets crowned.

That's basically it.

## What's in the repo

Server code lives in `apps/server`, web app in `apps/web`.

The backend is split up on purpose — domain rules, use cases, infrastructure (Prisma + iTunes), and the HTTP/socket layer — so the party logic isn't tangled up with Express or Socket.io everywhere. The web side is a Vite + React client that talks to the API and listens for realtime updates over sockets.

```
apps/server/src
├── domain/          entities, scoring, domain rules
├── application/     use cases + ports (no Express/Prisma here)
├── infrastructure/  Prisma repo, iTunes search client
├── interfaces/      REST routes + socket handlers
└── main.ts          wires it all together
```

## Music

Search and playback come from the public iTunes Search API. No API key needed for local dev.

Heads up: iTunes only gives you **30-second previews**, not full songs. The app is built around that — nothing pretends you're streaming full tracks.

## Run it locally

```bash
npm install
npm run db:setup    # sqlite db + prisma client + quick sanity check
npm run dev         # api on :4000, web on :5173
```

`db:setup` applies the checked-in migration, generates Prisma, and runs a smoke test on the schema. If you'd rather use Prisma Migrate directly, `npm run db:migrate` works too.

### Tests

```bash
npm run test:e2e    # Playwright — spins up test servers for you
```

There's also a small unit test suite for the scoring math: `npm run test:unit`.

## How the crown works

One song wins at the end. The score mixes three signals:

```
score = uniqueCheerers × 5  +  cheers × 3  +  queueUpvotes × 2
```

- **cheers** — how loud the room went while the song was on
- **unique cheerers** — how many *different* people reacted (weighted highest, so a room-wide favorite beats one person mashing the button)
- **queue upvotes** — belief in a song before it plays (also bumps it up the queue)

Standings stay hidden until the reveal so the end actually feels like a moment.

The anti-spam bit: cheering a bunch only counts you once for `uniqueCheerers`. That's in `apps/server/src/domain/scoring.test.ts` if you want to peek.

## A few product choices

- **Host sets the queue cap** (3–50 songs) when creating a party. One knob, actually enforced — didn't want a settings screen full of things that don't do anything.
- **Playback stays in sync** because the server owns party state and broadcasts snapshots over Socket.io whenever something changes. Your browser plays the preview locally, but everyone seeks to the same start time.
- **No accounts** — you get a participant id when you create or join, it saves in `localStorage`, and a refresh keeps you in the room.
