# Architecture Notes

Nero uses clean boundaries without over-abstracting the small assignment scope.

## Layers

- `domain`: pure business concepts such as parties, tracks, queue items, score calculation, and winner selection.
- `application`: use cases such as creating a party, joining, searching tracks, adding to queue, cheering, and ending a party. These depend on ports.
- `infrastructure`: concrete adapters for Prisma persistence and iTunes search.
- `interfaces`: Express routes and Socket.IO handlers.
- `main.ts`: the composition root. Object creation lives here so use cases stay easy to test.

## Data Flow

```text
React UI -> REST/Socket.IO -> interface handler -> application use case -> port -> Prisma/iTunes adapter
```

## Scoring

The initial scoring model is intentionally understandable:

```text
score = cheers * 3 + queueUpvotes * 2 + uniqueCheerers * 5
```

This rewards crowd energy while resisting one person repeatedly clicking cheer as the only deciding factor.

