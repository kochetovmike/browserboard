import type { AiLevel, Engine, GameDefinition, Side } from '../../core/types';
import { captureScore, evaluate } from './engine/eval';
import {
  fromFen,
  fromUci,
  PROMO_NAMES,
  START_FEN,
  squareName,
  toFen,
  toSan,
  toUci,
} from './engine/notation';
import {
  type ChessMove,
  type ChessPosition,
  clonePosition,
  colorOf,
  fileOf,
  inCheck,
  insufficientMaterial,
  legalMoves,
  makeMove,
  mFrom,
  mPromo,
  mTo,
  noisyMoves,
  onBoard,
  rankOf,
  repetitions,
  typeOf,
  unmakeMove,
} from './engine/position';

export type { ChessMove, ChessPosition };

const KIND = ['', 'pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];

const engine: Engine<ChessPosition, ChessMove> = {
  clone: clonePosition,
  sideToMove: (p) => p.side,
  legalMoves,
  noisyMoves,
  forcedNoisy: () => false,
  make: makeMove,
  unmake: unmakeMove,
  evaluate,
  noMovesResult: (p) =>
    inCheck(p) ? { kind: 'loss', reason: 'checkmate' } : { kind: 'draw', reason: 'stalemate' },
  drawReason: (p, strict) => {
    if (p.halfmove >= 100) return '50-move rule';
    if (insufficientMaterial(p)) return 'insufficient material';
    if (repetitions(p) >= (strict ? 2 : 1)) return 'threefold repetition';
    return null;
  },
  extend: (p) => inCheck(p),
  hashLo: (p) => p.hashLo,
  hashHi: (p) => p.hashHi,
  moveId: (m) => m & 0x1ffff,
  captureScore,
};

const aiLevels: AiLevel[] = [
  { level: 1, name: 'Beginner', maxDepth: 1, timeMs: 400, noise: 300 },
  { level: 2, name: 'Easy', maxDepth: 2, timeMs: 600, noise: 120 },
  { level: 3, name: 'Medium', maxDepth: 3, timeMs: 1000, noise: 35 },
  { level: 4, name: 'Hard', maxDepth: 64, timeMs: 1500, noise: 0 },
  { level: 5, name: 'Expert', maxDepth: 64, timeMs: 4000, noise: 0 },
];

export const chess: GameDefinition<ChessPosition, ChessMove> = {
  id: 'chess',
  name: 'Chess',
  tagline: 'Full rules · castling, en passant, promotion',
  sideNames: ['White', 'Black'],
  engine,
  initial: () => fromFen(START_FEN),
  parse: fromFen,
  serialize: toFen,
  notation: (p, m) => toSan(p, m),
  moveToCode: toUci,
  moveFromCode: fromUci,
  choiceLabel: (m) => PROMO_NAMES[mPromo(m)] ?? toUci(m),
  aiLevels,
  board: {
    rows: 8,
    cols: 8,
    squareAt: (row, col) => (row < 0 || row > 7 || col < 0 || col > 7 ? -1 : (7 - row) * 16 + col),
    coordOf: (sq) => ({ row: 7 - rankOf(sq), col: fileOf(sq) }),
    bottomSide: 0 as Side,
    isDark: (r, c) => (r + c) % 2 === 1,
    pieces: (p) => {
      const out: { sq: number; side: Side; kind: string }[] = [];
      for (let sq = 0; sq < 128; sq++) {
        if (!onBoard(sq)) {
          sq += 7;
          continue;
        }
        const pc = p.board[sq];
        if (pc) out.push({ sq, side: colorOf(pc), kind: KIND[typeOf(pc)] });
      }
      return out;
    },
    movePath: (m) => [mFrom(m), mTo(m)],
    highlightSquares: (m) => [mFrom(m), mTo(m)],
    alertSquare: (p) => (inCheck(p) ? p.kings[p.side] : -1),
    squareName,
    fileLabels: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
    rankLabels: ['8', '7', '6', '5', '4', '3', '2', '1'],
  },
};
