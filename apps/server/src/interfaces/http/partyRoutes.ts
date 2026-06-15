import { Router } from "express";
import type { PartyUseCases } from "../../application/partyUseCases.js";
import { addQueueItemSchema, createPartySchema, joinPartySchema, jumpSchema, participantActionSchema, searchSchema, voteSchema } from "./validators.js";

export function createPartyRouter(useCases: PartyUseCases) {
  const router = Router();

  router.post("/parties", async (req, res, next) => {
    try {
      const party = await useCases.createParty(createPartySchema.parse(req.body));
      res.status(201).json(party);
    } catch (error) {
      next(error);
    }
  });

  router.get("/parties/:code", async (req, res, next) => {
    try {
      const party = await useCases.getParty(req.params.code);
      if (!party) {
        res.status(404).json({ message: "Party not found." });
        return;
      }
      res.json(party);
    } catch (error) {
      next(error);
    }
  });

  router.post("/parties/:code/join", async (req, res, next) => {
    try {
      const party = await useCases.joinParty({ code: req.params.code, ...joinPartySchema.parse(req.body) });
      res.status(201).json(party);
    } catch (error) {
      next(error);
    }
  });

  router.post("/parties/:code/queue", async (req, res, next) => {
    try {
      const { participantId, track } = addQueueItemSchema.parse(req.body);
      const party = await useCases.addTrack({ code: req.params.code, participantId, queryTrack: track });
      res.status(201).json(party);
    } catch (error) {
      next(error);
    }
  });

  router.post("/parties/:code/vote", async (req, res, next) => {
    try {
      const { participantId, queueItemId } = voteSchema.parse(req.body);
      res.json(await useCases.vote({ code: req.params.code, participantId, queueItemId }));
    } catch (error) {
      next(error);
    }
  });

  router.post("/parties/:code/cheer", async (req, res, next) => {
    try {
      const { participantId } = participantActionSchema.parse(req.body);
      res.json(await useCases.cheer({ code: req.params.code, participantId }));
    } catch (error) {
      next(error);
    }
  });

  router.post("/parties/:code/start", async (req, res, next) => {
    try {
      res.json(await useCases.start(req.params.code));
    } catch (error) {
      next(error);
    }
  });

  router.post("/parties/:code/advance", async (req, res, next) => {
    try {
      res.json(await useCases.advance(req.params.code));
    } catch (error) {
      next(error);
    }
  });

  router.post("/parties/:code/jump", async (req, res, next) => {
    try {
      const { queueItemId } = jumpSchema.parse(req.body);
      res.json(await useCases.jump({ code: req.params.code, queueItemId }));
    } catch (error) {
      next(error);
    }
  });

  router.post("/parties/:code/end", async (req, res, next) => {
    try {
      res.json(await useCases.end(req.params.code));
    } catch (error) {
      next(error);
    }
  });

  router.get("/music/search", async (req, res, next) => {
    try {
      const { q } = searchSchema.parse(req.query);
      res.json(await useCases.searchTracks(q));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
