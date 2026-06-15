# Nero Party

Nero Party is a real-time listening party app. Hosts create a party, friends join with a shareable code, everyone adds iTunes preview tracks to a shared queue, participants cheer songs in real time, and the party ends with a crowned winner.

## Architecture

The server follows a clean architecture shape inspired by the referenced Python clean architecture repo:

```text
apps/server/src
├── domain/          Core entities, scoring rules, and domain errors
├── application/     Use cases and ports; no Express, Socket.IO, or Prisma imports
├── infrastructure/  Prisma repositories and iTunes API adapter
├── interfaces/      HTTP routes and Socket.IO event handlers
└── main.ts          Composition root that wires concrete adapters to use cases
```

Dependency direction is inward: interfaces call application use cases, use cases depend on port interfaces, and infrastructure implements those ports.

The web app is a Vite React client organized by feature-oriented components and small API/socket clients.

## Music API

This project uses the public **iTunes Search API** for track search and playback. It needs no API key for local use. iTunes only serves **30-second preview clips**, so every track plays as a 30-second preview — there is no full-track playback, and the UI never claims otherwise.

## Local Setup

```bash
npm install         # install all workspace deps
npm run db:setup    # create local SQLite db from the migration + generate Prisma Client + smoke test
npm run dev         # start API (http://localhost:4000) and web (http://localhost:5173)
```

`db:setup` builds the local SQLite database from the checked-in migration SQL, generates Prisma Client, and runs a smoke test against the tables, relations, indexes, and cascade behavior. If you prefer Prisma Migrate directly, `npm run db:migrate` is also available.

### Tests

```bash
npm run test:e2e    # Playwright end-to-end suite (boots the API + web on test ports automatically)
```

## How the crown works

At the end of the night one song is crowned. The score combines three signals, each capturing a different kind of approval:

```text
score = uniqueCheerers × 5  +  cheers × 3  +  queueUpvotes × 2
```

- **cheers** capture *intensity* — how hard the room reacted while a song played.
- **unique cheerers** capture *breadth* — how many different people reacted. Weighted highest so a song that moved the whole room beats one a single fan hammered.
- **queue upvotes** capture *anticipation* — belief in a song before it plays (upvotes also bump it up the queue).
- **standings are sealed** until the end, so the reveal keeps its tension.

This is the anti-brigading guardrail: one guest spamming cheer inflates raw `cheers`, but counts only once toward `uniqueCheerers`. The weighting is covered by a unit test (`apps/server/src/domain/scoring.test.ts`).

## Product Decisions

- **Winner mechanic:** see *How the crown works* above — breadth (`uniqueCheerers ×5`) intentionally outweighs volume (`cheers ×3`) and anticipation (`upvotes ×2`).
- **Standings are sealed** during the party so the reveal has tension.
- **Host control:** the host configures the queue's max song count (3–50) when creating a party. I kept this to a single meaningful knob rather than shipping options the app does not enforce.
- **Shared playback** is driven by server-side party state over Socket.IO: any HTTP mutation re-broadcasts a full `party:snapshot` to the room, so every client sees the same queue, current track, participants, and winner. Each client plays its own audio element seeked to the shared start time.
- **Identity** is a participant id returned on create/join and persisted in `localStorage`, so a refresh keeps you as the same participant rather than orphaning you. This is in-session identity, not authenticated accounts.
