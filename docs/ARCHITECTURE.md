# browserboard — Architecture

Status: **v0.1 implemented** (checkers and chess, AI with 5 levels, hot-seat play). Last updated 2026-11-03.

## 1. Goals and constraints

| Requirement                                               | Consequence                                                                  |
| --------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Hosted on free GitHub Pages, custom domain possible later | Static build only. The same build must work under `/browserboard/` and `/`.  |
| Everything runs on the client                             | Rules, AI and persistence all live in the browser. No accounts, no backend.  |
| Chess and checkers first, more games later                | Game-agnostic core plus self-contained game modules.                         |
| AI opponents with difficulty levels                       | One shared search engine with game-specific evaluation, run in a Web Worker. |
| Two players in one browser window (hot-seat)              | Human and AI players are interchangeable behind one async interface.         |

Non-goals for now: online multiplayer, accounts, strong engines, clocks.

## 2. Technology

| Concern         | Choice                                  | Why                                                                |
| --------------- | --------------------------------------- | ------------------------------------------------------------------ |
| Language        | TypeScript (strict)                     | Move generators and search are easy to get subtly wrong.           |
| Build           | Vite                                    | Static output, first-class module-worker support.                  |
| UI              | Preact + @preact/signals                | Small; signals drive re-renders from session state.                |
| Board           | SVG, one generic `Board` component      | Scales to any screen, simple hit-testing, works for any grid game. |
| Tests           | Vitest                                  | Shares Vite's config.                                              |
| Lint and format | Biome                                   | One tool.                                                          |
| Deploy          | GitHub Actions → `actions/deploy-pages` | Lint, test, build and publish on every push to `main`.             |

### Hosting on GitHub Pages

- Hash routing (`#/play/chess?...`). Pages has no SPA fallback.
- `base: './'` in Vite. All asset URLs are relative, so no rebuild is needed to move to a custom domain (just add `public/CNAME`).
- Pages cannot send custom headers, so there is no COOP/COEP. That means no `SharedArrayBuffer` and no multi-threaded WASM. The design uses one worker with `postMessage`, so this does not affect it.
- All of a user's Pages project sites share one origin (`<user>.github.io`), so every `localStorage` key is namespaced as `browserboard:v1:*`. Moving to a custom domain changes the origin, so saved games on the old address do not carry over.
- One-time repository setting: Settings → Pages → Source = **GitHub Actions**.

## 3. Layers

```
ui/        Preact shell: Home (game picker), Play (board + panel), Board, pieces, router
session/   GameSession (turn loop, undo, persistence) · storage (localStorage)
players/   HumanPlayer · AiPlayer ──postMessage──▶ ai/ai.worker.ts
ai/        search.ts (game-agnostic) · protocol.ts · client.ts · ai.worker.ts
games/     <id>/engine/* (rules, eval, notation) · <id>/index.ts (GameDefinition) · registry.ts
core/      types.ts (contracts) · rules.ts (immutable helpers, replay, perft)
```

**Hard rule:** `core/`, `games/*/engine`, `games/*/index.ts` and `ai/` are DOM-free. They run in the worker and in Node (Vitest). Game artwork lives in `ui/pieces.tsx`, not in `games/`.

## 4. Core contracts (`src/core/types.ts`)

- **`Engine<P, M>`** is a _mutable_ make/unmake API: `legalMoves`, `noisyMoves`, `forcedNoisy`, `make`, `unmake`, `evaluate`, `noMovesResult`, `drawReason(strict)`, `extend?`, Zobrist `hashLo`/`hashHi`, `moveId` and `captureScore`. It is the AI's hot path.
- **Immutable use** goes through `core/rules.ts`: `play()` (clone + make), `statusOf()`, `replay()` and `perft()`. The UI and session never mutate positions, and there is exactly one move generator per game. This replaces the two-interface idea from the original proposal, so no agreement test is needed.
- **`GameDefinition<P, M>`** holds everything one game contributes:
  - its engine, serialization (FEN), notation (SAN / PDN), stable move codes (UCI / PDN) and choice labels;
  - its AI levels;
  - a `BoardGeometry`, pure data the generic SVG board renders from: square mapping, pieces, click paths, highlights and labels.
- **`AiLevel`** is `{maxDepth, timeMs, noise}`. Difficulty is search parameters, not separate engines.

Move codes are the only move representation that crosses the worker boundary or goes into storage.

## 5. Games

### Checkers (`src/games/checkers`): American / English draughts

- 32 playable squares as 32-bit bitboards (`men[side]`, `kings[side]`), with precomputed neighbour and jump tables. Square id `n` is PDN square `n+1`. Black (side 0) starts on squares 1–12 and moves first.
- Captures are mandatory, and a full multi-jump sequence is one move. Men capture forward only. A man crowned mid-capture stops there. Kings move one square in any direction.
- Draws: threefold repetition, or 40 moves each with no capture and no man move.
- Notation: `11-15`, `9x18x27`. FEN: `B:W21,22,K30:B1,2`.
- Evaluation: material (man 100, king 160), advancement and centre tables, back-rank guard, a bonus for trading when ahead, and a king-hunt bonus in endgames.

### Chess (`src/games/chess`)

- 0x88 board. Moves are packed ints: `from | to<<7 | promo<<14 | flags<<17`. Pseudo-legal generation plus a king-safety filter.
- Full rules: castling, en passant, promotion, checkmate, stalemate, threefold repetition, the 50-move rule and insufficient material.
- FEN, SAN (with disambiguation and `+`/`#`) and UCI.
- Evaluation: material plus tapered piece-square tables (simplified evaluation function), a bishop-pair bonus, and a mop-up term that helps convert won endgames.

## 6. AI (`src/ai`)

- `searchBestMove` combines:
  - negamax with alpha-beta and PVS;
  - iterative deepening under a time budget;
  - a transposition table (2^18 entries, mate-distance adjusted);
  - move ordering by TT move, then captures, then killer moves, then history;
  - quiescence search, which has no stand-pat when `forcedNoisy` (checkers captures);
  - check extension through `extend`.
- **Noise**: at noisy levels every root move is searched with a full window, and the move is picked at random, weighted, among those within `noise` points of the best. Forced mates are never randomised away.
- **Levels** (defined in each game's `index.ts`):

| Level      | Chess                      | Checkers                   |
| ---------- | -------------------------- | -------------------------- |
| 1 Beginner | depth 1, noise 300         | depth 1, noise 160         |
| 2 Easy     | depth 2, noise 120         | depth 3, noise 70          |
| 3 Medium   | depth 3, noise 35          | depth 6, noise 20          |
| 4 Hard     | iterative deepening, 1.5 s | iterative deepening, 1.5 s |
| 5 Expert   | iterative deepening, 4 s   | iterative deepening, 4 s   |

- **Worker protocol**: the request carries `{gameId, start, moves[], level}`. The worker replays the moves, so it sees the full repetition history, and replies with a move code. `AiClient` creates the worker lazily and **terminates** it on abort (undo, new game, leaving the page), because a synchronous search cannot be interrupted any other way.

## 7. Session and players

- `Player.requestMove(req, signal): Promise<M>`. `HumanPlayer` resolves when the UI calls `provide()`. `AiPlayer` asks the worker, with a 350 ms minimum "think" time.
- `GameSession`:
  - holds signals for `positions`, `moves`, `notations`, `thinking`, `error`, plus computed `current` and `status`;
  - asks the side-to-move's player for a move, applies it, saves, and repeats;
  - uses a generation token so late replies after undo or dispose are discarded.
- Undo: one ply in hot-seat; in AI mode it goes back to the human's previous turn.
- Persistence: `{config, start, moves[]}` per game. "Continue" on the home page replays it. Setup preferences are stored per game.

## 8. UI

- Routes: `#/` (game picker) and `#/play/<id>?mode=ai|hotseat&level=1..5&side=0|1[&resume=1]`. `App` keys `Play` on the route, so a new hash means a fresh session.
- `Board` is game-agnostic. Each move has a _click path_ (`[from, ...hops, to]`):
  - Clicking a final square plays the move.
  - Clicking an intermediate hop narrows the choice (checkers multi-jumps).
  - Several moves with the same path (promotion) open a chooser.
- The board flips automatically so the human's side is at the bottom in AI mode. A Flip button is always available.
- Accessibility: interactive squares are focusable `role="button"` elements with labels like "e2, White pawn", operated with Enter or Space. Status updates use `aria-live`. Light and dark themes come from CSS custom properties.
- Chess pieces are Unicode glyphs, with a solid glyph under an outline glyph for White. Checkers pieces are drawn in SVG.

## 9. Testing

- Perft:
  - Checkers, depth 1–7 from the start position (7 … 179 740).
  - Chess, the standard suite (start position, Kiwipete, and CPW positions 3, 4 and 5). These are the main safety net for the rules code.
- Rule edge cases: forced multi-jump, crowning ends a capture, king back-captures, SAN disambiguation, checkmate, stalemate, insufficient material, threefold repetition, FEN round-trips, and the incremental hash matching a fresh hash.
- AI: mate in 1 and 2, winning free material, the checkers double jump, staying within the time budget, not mutating the root position, and noise never skipping a mate.
- Browser smoke testing was done manually with Playwright against `vite preview`. It is not committed or automated yet.

## 10. Next steps

- Commit a Playwright smoke test and run it in CI.
- Drag-to-move, move animation, last-move "review" (stepping through history), PGN export.
- PWA manifest and service worker for offline play.
- Checkers variants (Russian, International 10×10) through a variant config. Rules code currently assumes American rules.
- An opening book, and a stronger chess evaluation (mobility, pawn structure).
