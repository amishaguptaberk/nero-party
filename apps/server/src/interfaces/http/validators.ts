import { z } from "zod";

export const createPartySchema = z.object({
  name: z.string().min(2).max(60),
  hostName: z.string().min(1).max(40),
  maxSongs: z.coerce.number().int().min(3).max(50).default(20),
  maxMinutes: z.coerce.number().int().min(5).max(180).default(45),
});

export const joinPartySchema = z.object({
  name: z.string().min(1).max(40),
});

export const searchSchema = z.object({
  q: z.string().min(1).max(80),
});

