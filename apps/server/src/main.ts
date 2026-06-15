import "dotenv/config";
import cors from "cors";
import express from "express";
import http from "node:http";
import { Server } from "socket.io";
import { createPartyUseCases } from "./application/partyUseCases.js";
import { ItunesSearchClient } from "./infrastructure/itunes/itunesSearchClient.js";
import { MemoryPartyRepository } from "./infrastructure/memory/memoryPartyRepository.js";
import { SocketPartyEvents } from "./infrastructure/realtime/socketPartyEvents.js";
import { createPartyRouter } from "./interfaces/http/partyRoutes.js";
import { registerPartySocket } from "./interfaces/realtime/registerPartySocket.js";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.WEB_ORIGIN ?? "http://localhost:5173" },
});

const music = new ItunesSearchClient();
const events = new SocketPartyEvents(io);
const parties = new MemoryPartyRepository();
const useCases = createPartyUseCases({ parties, music, events });

app.use(cors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:5173" }));
app.use(express.json());
app.use("/api", createPartyRouter(useCases));
app.get("/health", (_req, res) => res.json({ ok: true }));

registerPartySocket(io, useCases);

const port = Number(process.env.PORT ?? 4000);
server.listen(port, () => {
  console.log(`Nero API listening on http://localhost:${port}`);
});
