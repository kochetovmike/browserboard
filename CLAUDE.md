# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

browserboard is a fully client-side board games site (checkers and chess) with AI opponents at five difficulty levels and same-window hot-seat play. It is deployed as a static site to free GitHub Pages. The design and its reasons are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md); keep that file in sync when an architectural decision changes.

Stack: TypeScript (strict) · Vite · Preact + @preact/signals · SVG boards · Vitest · Biome · npm.

## Commands

```sh
npm run dev            # Vite dev server
npm run build          # tsc --noEmit + production build to dist/
npm run preview        # serve dist/ (check the Pages build: relative paths, worker)
npm test               # Vitest, all unit tests (perft included, ~1 s)
npx vitest run src/games/chess/engine/chess.test.ts   # one file
npx vitest run -t "kiwipete"                          # one test by name
npm run lint           # biome check (CI runs this)
npx biome check --write .                             # apply safe lint/format fixes
```

CI ([.github/workflows/deploy.yml](.github/workflows/deploy.yml)) runs lint, test and build on PRs, and also deploys on pushes to `main`.

## Architecture rules that are easy to break

- **DOM-free core:** `src/core`, `src/games/**` and `src/ai` must not import from `src/ui` or touch `window`/`document`. They are bundled into the AI Web Worker and run in Node under Vitest. Piece artwork belongs in `src/ui/pieces.tsx`.
- **One mutable engine per game:** each game implements `Engine` (make/unmake) once. UI and session code must use the immutable helpers in `src/core/rules.ts` (`play`, `statusOf`, `replay`) and never mutate a position held in signals.
- **AI is game-agnostic:** `src/ai/search.ts` must not know about chess or checkers. Game knowledge lives in `games/<id>/engine/eval.ts` and the `aiLevels` in `games/<id>/index.ts`. Difficulty is `{maxDepth, timeMs, noise}`, not a separate engine.
- **Worker boundary:** only plain data crosses it: start position string, move _codes_ (UCI / PDN) and `AiLevel`. The worker replays moves to get repetition history. Aborting means terminating the worker (`AiClient.reset`), and `GameSession`'s generation token discards late replies.
- **Players are interchangeable** (`Player.requestMove` is async). `GameSession` must not special-case player types beyond constructing them.
- **The generic board relies on `BoardGeometry`:** a move's `movePath` is the click sequence. Click handling lives in the pure, unit-tested `resolveClick` ([src/ui/moveInput.ts](src/ui/moveInput.ts)): a square that ends some routes but continues others, or moves sharing a path (promotion), go to a chooser via `choiceLabel`. The optional `jumpedSquare` drives the mid-jump preview. Non-playable squares have id `-1`, so guard any `sq === x` comparison with `sq >= 0`.
- **Adding a game** means a new `src/games/<id>/` folder (engine + `GameDefinition`), an entry in `src/games/registry.ts`, and a renderer in `PIECES` (`src/ui/pieces.tsx`).
- **GitHub Pages:** use hash routing only and keep `base: './'`. Pages cannot set COOP/COEP headers, so `SharedArrayBuffer` is unavailable. `localStorage` keys must keep the `browserboard:v1:` prefix because the origin is shared with the owner's other Pages sites. Bump the version if the save format changes.

## Correctness expectations

- Move-generation changes must keep the perft tests passing (`chess.test.ts`, `checkers.test.ts`).
- Checkers follows American / English rules: mandatory capture, men move and capture forward only, short kings, crowning ends a capture. Square ids are PDN squares minus one, and Black (side 0) moves first from squares 1–12.
- Side 0 always moves first (White in chess, Black in checkers). `GameDefinition.sideNames` maps sides to names.
