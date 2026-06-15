import { Router } from "express";
import type { PartyUseCases } from "../../application/partyUseCases.js";
import { createPartySchema, joinPartySchema, searchSchema } from "./validators.js";

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
