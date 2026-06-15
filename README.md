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

This project uses the public iTunes Search API for track search and 30-second preview playback. It does not require an API key for local demo use.

## Local Setup

```bash
npm install
npm run db:setup
npm run dev
```

The API runs on `http://localhost:4000` and the web app runs on `http://localhost:5173`.

`db:setup` creates the local SQLite database from the checked-in migration SQL, generates Prisma Client, and runs a smoke test against the tables, relations, indexes, and cascade behavior.

If you prefer Prisma Migrate directly, `npm run db:migrate` is also available.

## Product Decisions

- Winner mechanic: each played song collects live cheers, and queued songs can receive upvotes before they play.
- Standings are sealed during the party so the reveal has tension.
- Hosts can configure max songs, max minutes, and preview mode.
- Shared playback is driven by server-side party state over Socket.IO so all clients see the same queue, current track, participants, and winner.
