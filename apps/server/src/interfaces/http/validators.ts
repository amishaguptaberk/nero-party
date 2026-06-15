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

export const trackSchema = z.object({
  provider: z.literal("itunes"),
  providerId: z.string().min(1),
  title: z.string().min(1),
  artist: z.string().min(1),
  album: z.string().nullish(),
  artworkUrl: z.string().url().nullish(),
  previewUrl: z.string().url(),
  durationMs: z.number().int().positive().nullish(),
});

export const addQueueItemSchema = z.object({
  participantId: z.string().min(1),
  track: trackSchema,
});

export const participantActionSchema = z.object({
  participantId: z.string().min(1),
});

export const voteSchema = participantActionSchema.extend({
  queueItemId: z.string().min(1),
});

export const jumpSchema = z.object({
  queueItemId: z.string().min(1),
});
