import type { Server, Socket } from "socket.io";
import type { PartyUseCases } from "../../application/partyUseCases.js";

export function registerPartySocket(io: Server, useCases: PartyUseCases) {
  io.on("connection", (socket: Socket) => {
    socket.on("party:join-room", async ({ code }: { code: string }) => {
      socket.join(code);
      const snapshot = await useCases.getParty(code);
      if (snapshot) socket.emit("party:snapshot", snapshot);
    });

    socket.on("party:vote", async (input: { code: string; participantId: string; queueItemId: string }) => {
      await useCases.vote(input);
    });

    socket.on("party:cheer", async (input: { code: string; participantId: string }) => {
      await useCases.cheer(input);
    });

    socket.on("party:start", async ({ code }: { code: string }) => {
      await useCases.start(code);
    });

    socket.on("party:advance", async ({ code }: { code: string }) => {
      await useCases.advance(code);
    });

    socket.on("party:jump", async (input: { code: string; queueItemId: string }) => {
      await useCases.jump(input);
    });

    socket.on("party:end", async ({ code }: { code: string }) => {
      await useCases.end(code);
    });

    socket.on("party:chat", ({ code, name, text }: { code: string; name: string; text: string }) => {
      const body = text?.trim().slice(0, 240);
      if (!code || !body) return;
      io.to(code).emit("party:chat", {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: (name || "guest").slice(0, 40),
        text: body,
        at: Date.now(),
      });
    });

    socket.on("party:reaction", ({ code, name, emoji }: { code: string; name: string; emoji: string }) => {
      if (!code || !emoji) return;
      io.to(code).emit("party:reaction", {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: (name || "guest").slice(0, 40),
        emoji: emoji.slice(0, 8),
      });
    });
  });
}
