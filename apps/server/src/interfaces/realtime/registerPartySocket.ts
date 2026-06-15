import type { Server, Socket } from "socket.io";
import type { PartyUseCases } from "../../application/partyUseCases.js";

// Grace window before a disconnected socket is treated as "left" — long enough that
// a page refresh (disconnect immediately followed by reconnect) doesn't fire a leave.
const LEAVE_GRACE_MS = 6_000;

export function registerPartySocket(io: Server, useCases: PartyUseCases) {
  const pendingLeaves = new Map<string, NodeJS.Timeout>();

  io.on("connection", (socket: Socket) => {
    socket.on("party:join-room", async ({ code, participantId }: { code: string; participantId?: string }) => {
      socket.join(code);
      socket.data.code = code;
      socket.data.participantId = participantId;

      if (participantId) {
        const pending = pendingLeaves.get(participantId);
        if (pending) {
          clearTimeout(pending);
          pendingLeaves.delete(participantId);
        }
        // Mark present (clears a prior leave and announces a return if they had left).
        await useCases.setPresence({ code, participantId, present: true }).catch(() => undefined);
      }

      const snapshot = await useCases.getParty(code);
      if (snapshot) socket.emit("party:snapshot", snapshot);
    });

    socket.on("disconnect", () => {
      const { code, participantId } = socket.data as { code?: string; participantId?: string };
      if (!code || !participantId) return;
      const timer = setTimeout(() => {
        pendingLeaves.delete(participantId);
        useCases.setPresence({ code, participantId, present: false }).catch(() => undefined);
      }, LEAVE_GRACE_MS);
      pendingLeaves.set(participantId, timer);
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
