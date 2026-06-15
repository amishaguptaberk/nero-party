import type { Server } from "socket.io";
import type { PartyEvents } from "../../application/ports.js";

export class SocketPartyEvents implements PartyEvents {
  constructor(
    private readonly io: Server,
    private readonly afterPublish?: (code: string, snapshot: Parameters<PartyEvents["publishPartySnapshot"]>[1]) => void,
  ) {}

  publishPartySnapshot(code: string, snapshot: Parameters<PartyEvents["publishPartySnapshot"]>[1]) {
    this.io.to(code).emit("party:snapshot", snapshot);
    this.afterPublish?.(code, snapshot);
  }

  publishSystemMessage(code: string, text: string) {
    this.io.to(code).emit("party:chat", {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: "",
      text,
      at: Date.now(),
      system: true,
    });
  }
}
