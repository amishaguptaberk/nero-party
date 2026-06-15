import type { Server } from "socket.io";
import type { PartyEvents } from "../../application/ports.js";

export class SocketPartyEvents implements PartyEvents {
  constructor(private readonly io: Server) {}

  publishPartySnapshot(code: string, snapshot: Parameters<PartyEvents["publishPartySnapshot"]>[1]) {
    this.io.to(code).emit("party:snapshot", snapshot);
  }
}

