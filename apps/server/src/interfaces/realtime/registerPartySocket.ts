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

    socket.on("party:end", async ({ code }: { code: string }) => {
      await useCases.end(code);
    });
  });
}
