import type { AiLevel, Engine, GameDefinition, Side } from '../../core/types';
import { evaluate } from './engine/eval';
import { fromFen, moveFromPdn, moveToPdn, toFen } from './engine/notation';
import {
  bit,
  type CheckersMove,
  type CheckersPosition,
  clonePosition,
  colOf,
  generateCaptures,
  generateMoves,
  hasCapture,
  initialPosition,
  makeMove,
  popcount,
  QUIET_PLY_LIMIT,
  repetitions,
  rowOf,
  squareAt,
  unmakeMove,
} from './engine/position';

export type { CheckersMove, CheckersPosition };

const engine: Engine<CheckersPosition, CheckersMove> = {
  clone: clonePosition,
  sideToMove: (p) => p.side,
  legalMoves: generateMoves,
  noisyMoves: generateCaptures,
  forcedNoisy: hasCapture,
  make: makeMove,
  unmake: unmakeMove,
  evaluate,
  noMovesResult: (p) => ({
    kind: 'loss',
    reason: (p.men[p.side] | p.kings[p.side]) === 0 ? 'all pieces captured' : 'no legal moves',
  }),
  drawReason: (p, strict) => {
    if (p.quiet >= QUIET_PLY_LIMIT) return '40-move rule';
    const reps = repetitions(p);
    if (reps >= (strict ? 2 : 1)) return 'threefold repetition';
    return null;
  },
  hashLo: (p) => p.hashLo,
  hashHi: (p) => p.hashHi,
  // from/to plus a hash of the captured set: distinguishes different jump routes.
  moveId: (m) => (m.from | (m.to << 5) | ((Math.imul(m.captures, 0x9e3779b1) >>> 12) << 10)) >>> 0,
  captureScore: (_p, m) =>
    m.captures === 0 ? 0 : popcount(m.captures) * 100 + popcount(m.capturedKings) * 50,
};

const aiLevels: AiLevel[] = [
  { level: 1, name: 'Beginner', maxDepth: 1, timeMs: 400, noise: 160 },
  { level: 2, name: 'Easy', maxDepth: 3, timeMs: 600, noise: 70 },
  { level: 3, name: 'Medium', maxDepth: 6, timeMs: 900, noise: 20 },
  { level: 4, name: 'Hard', maxDepth: 64, timeMs: 1500, noise: 0 },
  { level: 5, name: 'Expert', maxDepth: 64, timeMs: 4000, noise: 0 },
];

export const checkers: GameDefinition<CheckersPosition, CheckersMove> = {
  id: 'checkers',
  name: 'Checkers',
  tagline: 'American rules · captures are mandatory',
  sideNames: ['Black', 'White'],
  engine,
  initial: initialPosition,
  parse: fromFen,
  serialize: toFen,
  notation: (_p, m) => moveToPdn(m),
  moveToCode: moveToPdn,
  moveFromCode: moveFromPdn,
  choiceLabel: (m) => moveToPdn(m),
  aiLevels,
  board: {
    rows: 8,
    cols: 8,
    squareAt,
    coordOf: (sq) => ({ row: rowOf(sq), col: colOf(sq) }),
    bottomSide: 1 as Side,
    isDark: (r, c) => (r + c) % 2 === 1,
    pieces: (p) => {
      const out: { sq: number; side: Side; kind: string }[] = [];
      for (let sq = 0; sq < 32; sq++) {
        for (const s of [0, 1] as Side[]) {
          if (p.men[s] & bit(sq)) out.push({ sq, side: s, kind: 'man' });
          else if (p.kings[s] & bit(sq)) out.push({ sq, side: s, kind: 'king' });
        }
      }
      return out;
    },
    movePath: (m) => [m.from, ...m.path],
    jumpedSquare: (a, b) => {
      const dr = rowOf(b) - rowOf(a);
      if (Math.abs(dr) !== 2) return -1;
      return squareAt(rowOf(a) + dr / 2, (colOf(a) + colOf(b)) / 2);
    },
    highlightSquares: (m) => [m.from, ...m.path],
    alertSquare: () => -1,
    squareName: (sq) => String(sq + 1),
    squareCaption: (sq) => String(sq + 1),
  },
};
