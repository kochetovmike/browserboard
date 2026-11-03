/**
 * Game-agnostic contracts. Everything in src/core, src/games/<id>/engine and src/ai
 * must stay DOM-free: it runs on the main thread, inside the AI Web Worker and in Vitest.
 */

/** 0 = the side that moves first (White in chess, Black in checkers). */
export type Side = 0 | 1;

export const other = (s: Side): Side => (s ^ 1) as Side;

export type GameStatus =
  | { kind: 'ongoing' }
  | { kind: 'win'; winner: Side; reason: string }
  | { kind: 'draw'; reason: string };

export type NoMovesResult = { kind: 'loss' | 'draw'; reason: string };

/**
 * Mutable, make/unmake position API. This is the AI hot path, and the immutable
 * helpers in core/rules.ts are built on top of it (clone + make), so the UI and the AI
 * always share one move generator.
 */
export interface Engine<P, M> {
  clone(p: P): P;
  sideToMove(p: P): Side;
  /** All legal moves for the side to move. */
  legalMoves(p: P): M[];
  /** Legal "noisy" moves (captures, promotions) searched by quiescence. */
  noisyMoves(p: P): M[];
  /** True when the side to move must play a noisy move (no stand-pat), e.g. forced capture in checkers. */
  forcedNoisy(p: P): boolean;
  make(p: P, m: M): void;
  unmake(p: P, m: M): void;
  /** Static evaluation from the side-to-move's point of view (≈ centipawns). */
  evaluate(p: P): number;
  /** Outcome when the side to move has no legal moves. */
  noMovesResult(p: P): NoMovesResult;
  /**
   * Draw by rule (repetition, move counters, insufficient material), or null.
   * `strict` = true applies the official rules (e.g. threefold); false is the search
   * shortcut (any repetition counts as a draw).
   */
  drawReason(p: P, strict: boolean): string | null;
  /** Optional search extension trigger (e.g. side to move is in check). */
  extend?(p: P): boolean;
  hashLo(p: P): number;
  hashHi(p: P): number;
  /** Compact id, unique among the legal moves of one position (used for TT/killers). */
  moveId(m: M): number;
  /** Move-ordering bonus for captures (MVV-LVA etc.); 0 for quiet moves. */
  captureScore(p: P, m: M): number;
}

/** One AI difficulty level, expressed purely as search parameters. */
export interface AiLevel {
  level: number;
  name: string;
  maxDepth: number;
  timeMs: number;
  /** Root moves scoring within `noise` of the best are chosen at random (0 = always best). */
  noise: number;
}

/** Pure-data board geometry used by the UI. Square ids are the engine's own square ids. */
export interface BoardGeometry<P, M> {
  rows: number;
  cols: number;
  /** Square id at (row, col) with `bottomSide` at the bottom, or -1 if not playable. */
  squareAt(row: number, col: number): number;
  coordOf(sq: number): { row: number; col: number };
  /** Side shown at the bottom when the board is not flipped. */
  bottomSide: Side;
  isDark(row: number, col: number): boolean;
  pieces(p: P): { sq: number; side: Side; kind: string }[];
  /** Squares a user clicks to enter this move: [from, ...intermediate, to]. */
  movePath(m: M): number[];
  /** Squares to highlight as "last move". */
  highlightSquares(m: M): number[];
  /** Square to flag as "in check", if any. */
  alertSquare(p: P): number;
  squareName(sq: number): string;
  /** Optional per-square caption drawn small in the corner (e.g. checkers numbering). */
  squareCaption?(sq: number): string | null;
  /** Edge coordinate labels in unflipped orientation. */
  fileLabels?: string[];
  rankLabels?: string[];
}

/** Everything a game contributes, minus its UI components. */
export interface GameDefinition<P = unknown, M = unknown> {
  id: string;
  name: string;
  tagline: string;
  sideNames: [string, string];
  engine: Engine<P, M>;
  initial(): P;
  parse(serialized: string): P;
  serialize(p: P): string;
  /** Human-readable notation (SAN / PDN) in the context of `p` (position before the move). */
  notation(p: P, m: M): string;
  /** Stable machine code (UCI / PDN) used for persistence and the worker protocol. */
  moveToCode(m: M): string;
  moveFromCode(p: P, code: string): M | null;
  /** Label for choosing between moves that share a click path (e.g. promotion piece). */
  choiceLabel(m: M): string;
  aiLevels: AiLevel[];
  board: BoardGeometry<P, M>;
}
