import { mulberry32 } from '../../../core/rules';
import type { Side } from '../../../core/types';

/**
 * 0x88 chess board. Square index = rank * 16 + file (rank 0 = rank "1", file 0 = "a").
 * Piece = type | (colour << 3); 0 = empty. White = side 0.
 *
 * Moves are packed integers: from | to << 7 | promo << 14 | flags << 17.
 */

export const WHITE = 0;
export const BLACK = 1;
export const PAWN = 1;
export const KNIGHT = 2;
export const BISHOP = 3;
export const ROOK = 4;
export const QUEEN = 5;
export const KING = 6;

export const F_CAPTURE = 1;
export const F_EP = 2;
export const F_CASTLE = 4;
export const F_DOUBLE = 8;

export type ChessMove = number;

export const mFrom = (m: ChessMove) => m & 0x7f;
export const mTo = (m: ChessMove) => (m >> 7) & 0x7f;
export const mPromo = (m: ChessMove) => (m >> 14) & 0x7;
export const mFlags = (m: ChessMove) => (m >> 17) & 0xf;
const encode = (from: number, to: number, promo: number, flags: number): ChessMove =>
  from | (to << 7) | (promo << 14) | (flags << 17);

export const typeOf = (pc: number) => pc & 7;
export const colorOf = (pc: number) => (pc >> 3) as Side;
export const makePiece = (type: number, color: number) => type | (color << 3);
export const onBoard = (sq: number) => (sq & 0x88) === 0;
export const rankOf = (sq: number) => sq >> 4;
export const fileOf = (sq: number) => sq & 7;

export const CASTLE_WK = 1;
export const CASTLE_WQ = 2;
export const CASTLE_BK = 4;
export const CASTLE_BQ = 8;

export interface ChessPosition {
  board: Int8Array;
  side: Side;
  castling: number;
  ep: number;
  halfmove: number;
  fullmove: number;
  kings: [number, number];
  hashLo: number;
  hashHi: number;
  // Undo stacks (one entry per made move).
  uCaptured: number[];
  uCastling: number[];
  uEp: number[];
  uHalfmove: number[];
  /** Hashes of positions before each move, for repetition detection. */
  histLo: number[];
  histHi: number[];
}

export const KNIGHT_OFFSETS = [33, 31, 18, 14, -33, -31, -18, -14];
export const KING_OFFSETS = [1, -1, 16, -16, 17, 15, -17, -15];
export const BISHOP_DIRS = [17, 15, -17, -15];
export const ROOK_DIRS = [1, -1, 16, -16];

// Zobrist keys.
const rnd = mulberry32(0x5eed1234);
const ZP_LO = Array.from({ length: 16 * 128 }, () => rnd() | 0);
const ZP_HI = Array.from({ length: 16 * 128 }, () => rnd() | 0);
const ZC_LO = Array.from({ length: 16 }, () => rnd() | 0);
const ZC_HI = Array.from({ length: 16 }, () => rnd() | 0);
const ZE_LO = Array.from({ length: 128 }, () => rnd() | 0);
const ZE_HI = Array.from({ length: 128 }, () => rnd() | 0);
const ZS_LO = rnd() | 0;
const ZS_HI = rnd() | 0;

/** Castling rights kept after a move touches a square. */
const CASTLE_MASK = new Int8Array(128).fill(15);
CASTLE_MASK[0x00] = 15 & ~CASTLE_WQ;
CASTLE_MASK[0x07] = 15 & ~CASTLE_WK;
CASTLE_MASK[0x04] = 15 & ~(CASTLE_WK | CASTLE_WQ);
CASTLE_MASK[0x70] = 15 & ~CASTLE_BQ;
CASTLE_MASK[0x77] = 15 & ~CASTLE_BK;
CASTLE_MASK[0x74] = 15 & ~(CASTLE_BK | CASTLE_BQ);

export function emptyPosition(): ChessPosition {
  return {
    board: new Int8Array(128),
    side: 0,
    castling: 0,
    ep: -1,
    halfmove: 0,
    fullmove: 1,
    kings: [-1, -1],
    hashLo: 0,
    hashHi: 0,
    uCaptured: [],
    uCastling: [],
    uEp: [],
    uHalfmove: [],
    histLo: [],
    histHi: [],
  };
}

export function computeHash(p: ChessPosition): void {
  let lo = 0;
  let hi = 0;
  for (let sq = 0; sq < 128; sq++) {
    if (!onBoard(sq)) {
      sq += 7;
      continue;
    }
    const pc = p.board[sq];
    if (pc) {
      lo ^= ZP_LO[pc * 128 + sq];
      hi ^= ZP_HI[pc * 128 + sq];
    }
  }
  lo ^= ZC_LO[p.castling];
  hi ^= ZC_HI[p.castling];
  if (p.ep >= 0) {
    lo ^= ZE_LO[p.ep];
    hi ^= ZE_HI[p.ep];
  }
  if (p.side === 1) {
    lo ^= ZS_LO;
    hi ^= ZS_HI;
  }
  p.hashLo = lo;
  p.hashHi = hi;
}

export function clonePosition(p: ChessPosition): ChessPosition {
  return {
    board: p.board.slice(),
    side: p.side,
    castling: p.castling,
    ep: p.ep,
    halfmove: p.halfmove,
    fullmove: p.fullmove,
    kings: [p.kings[0], p.kings[1]],
    hashLo: p.hashLo,
    hashHi: p.hashHi,
    uCaptured: p.uCaptured.slice(),
    uCastling: p.uCastling.slice(),
    uEp: p.uEp.slice(),
    uHalfmove: p.uHalfmove.slice(),
    histLo: p.histLo.slice(),
    histHi: p.histHi.slice(),
  };
}

/** Is `sq` attacked by any piece of colour `by`? */
export function isAttacked(p: ChessPosition, sq: number, by: number): boolean {
  const b = p.board;
  // Pawns: a white pawn on sq-15 / sq-17 attacks sq; black on sq+15 / sq+17.
  const pawn = makePiece(PAWN, by);
  if (by === WHITE) {
    if (onBoard(sq - 15) && b[sq - 15] === pawn) return true;
    if (onBoard(sq - 17) && b[sq - 17] === pawn) return true;
  } else {
    if (onBoard(sq + 15) && b[sq + 15] === pawn) return true;
    if (onBoard(sq + 17) && b[sq + 17] === pawn) return true;
  }
  const knight = makePiece(KNIGHT, by);
  for (const o of KNIGHT_OFFSETS) {
    const t = sq + o;
    if (onBoard(t) && b[t] === knight) return true;
  }
  const king = makePiece(KING, by);
  for (const o of KING_OFFSETS) {
    const t = sq + o;
    if (onBoard(t) && b[t] === king) return true;
  }
  const bishop = makePiece(BISHOP, by);
  const rook = makePiece(ROOK, by);
  const queen = makePiece(QUEEN, by);
  for (const d of BISHOP_DIRS) {
    let t = sq + d;
    while (onBoard(t)) {
      const pc = b[t];
      if (pc) {
        if (pc === bishop || pc === queen) return true;
        break;
      }
      t += d;
    }
  }
  for (const d of ROOK_DIRS) {
    let t = sq + d;
    while (onBoard(t)) {
      const pc = b[t];
      if (pc) {
        if (pc === rook || pc === queen) return true;
        break;
      }
      t += d;
    }
  }
  return false;
}

export const inCheck = (p: ChessPosition, side: Side = p.side) =>
  isAttacked(p, p.kings[side], side ^ 1);

function addPawnMoves(
  out: ChessMove[],
  from: number,
  to: number,
  flags: number,
  promoRank: boolean,
) {
  if (promoRank) {
    for (const pr of [QUEEN, KNIGHT, ROOK, BISHOP]) out.push(encode(from, to, pr, flags));
  } else {
    out.push(encode(from, to, 0, flags));
  }
}

/** Pseudo-legal moves (may leave own king in check). `noisyOnly` = captures + promotions. */
export function pseudoMoves(p: ChessPosition, noisyOnly = false): ChessMove[] {
  const out: ChessMove[] = [];
  const b = p.board;
  const us = p.side;
  const them = us ^ 1;
  const fwd = us === WHITE ? 16 : -16;
  const startRank = us === WHITE ? 1 : 6;
  const lastRank = us === WHITE ? 7 : 0;

  for (let from = 0; from < 128; from++) {
    if (!onBoard(from)) {
      from += 7;
      continue;
    }
    const pc = b[from];
    if (!pc || colorOf(pc) !== us) continue;
    const t = typeOf(pc);

    if (t === PAWN) {
      const one = from + fwd;
      if (onBoard(one) && !b[one]) {
        const promo = rankOf(one) === lastRank;
        if (!noisyOnly || promo) addPawnMoves(out, from, one, 0, promo);
        if (!noisyOnly && rankOf(from) === startRank && !b[one + fwd]) {
          out.push(encode(from, one + fwd, 0, F_DOUBLE));
        }
      }
      for (const side of [-1, 1]) {
        const to = one + side;
        if (!onBoard(to)) continue;
        const target = b[to];
        if (target && colorOf(target) === them) {
          addPawnMoves(out, from, to, F_CAPTURE, rankOf(to) === lastRank);
        } else if (to === p.ep) {
          out.push(encode(from, to, 0, F_CAPTURE | F_EP));
        }
      }
      continue;
    }

    if (t === KNIGHT || t === KING) {
      for (const o of t === KNIGHT ? KNIGHT_OFFSETS : KING_OFFSETS) {
        const to = from + o;
        if (!onBoard(to)) continue;
        const target = b[to];
        if (!target) {
          if (!noisyOnly) out.push(encode(from, to, 0, 0));
        } else if (colorOf(target) === them) {
          out.push(encode(from, to, 0, F_CAPTURE));
        }
      }
      if (t === KING && !noisyOnly) addCastles(p, out, from);
      continue;
    }

    const dirs = t === BISHOP ? BISHOP_DIRS : t === ROOK ? ROOK_DIRS : KING_OFFSETS;
    for (const d of dirs) {
      let to = from + d;
      while (onBoard(to)) {
        const target = b[to];
        if (!target) {
          if (!noisyOnly) out.push(encode(from, to, 0, 0));
        } else {
          if (colorOf(target) === them) out.push(encode(from, to, 0, F_CAPTURE));
          break;
        }
        to += d;
      }
    }
  }
  return out;
}

function addCastles(p: ChessPosition, out: ChessMove[], from: number) {
  const b = p.board;
  const us = p.side;
  const them = us ^ 1;
  const base = us === WHITE ? 0x00 : 0x70;
  if (from !== base + 4) return;
  const kRight = us === WHITE ? CASTLE_WK : CASTLE_BK;
  const qRight = us === WHITE ? CASTLE_WQ : CASTLE_BQ;
  if (p.castling & kRight && !b[base + 5] && !b[base + 6]) {
    if (!isAttacked(p, base + 4, them) && !isAttacked(p, base + 5, them)) {
      out.push(encode(from, base + 6, 0, F_CASTLE));
    }
  }
  if (p.castling & qRight && !b[base + 3] && !b[base + 2] && !b[base + 1]) {
    if (!isAttacked(p, base + 4, them) && !isAttacked(p, base + 3, them)) {
      out.push(encode(from, base + 2, 0, F_CASTLE));
    }
  }
}

const xorPiece = (p: ChessPosition, pc: number, sq: number) => {
  p.hashLo ^= ZP_LO[pc * 128 + sq];
  p.hashHi ^= ZP_HI[pc * 128 + sq];
};

export function makeMove(p: ChessPosition, m: ChessMove): void {
  const b = p.board;
  const from = mFrom(m);
  const to = mTo(m);
  const flags = mFlags(m);
  const promo = mPromo(m);
  const us = p.side;
  const pc = b[from];

  p.histLo.push(p.hashLo);
  p.histHi.push(p.hashHi);
  p.uCastling.push(p.castling);
  p.uEp.push(p.ep);
  p.uHalfmove.push(p.halfmove);

  let captured = 0;
  if (flags & F_EP) {
    const capSq = to - (us === WHITE ? 16 : -16);
    captured = b[capSq];
    b[capSq] = 0;
    xorPiece(p, captured, capSq);
  } else if (b[to]) {
    captured = b[to];
    xorPiece(p, captured, to);
  }
  p.uCaptured.push(captured);

  const placed = promo ? makePiece(promo, us) : pc;
  b[from] = 0;
  b[to] = placed;
  xorPiece(p, pc, from);
  xorPiece(p, placed, to);

  if (flags & F_CASTLE) {
    const [rf, rt] = to > from ? [from + 3, from + 1] : [from - 4, from - 1];
    const rook = b[rf];
    b[rf] = 0;
    b[rt] = rook;
    xorPiece(p, rook, rf);
    xorPiece(p, rook, rt);
  }
  if (typeOf(pc) === KING) p.kings[us] = to;

  p.hashLo ^= ZC_LO[p.castling];
  p.hashHi ^= ZC_HI[p.castling];
  p.castling &= CASTLE_MASK[from] & CASTLE_MASK[to];
  p.hashLo ^= ZC_LO[p.castling];
  p.hashHi ^= ZC_HI[p.castling];

  if (p.ep >= 0) {
    p.hashLo ^= ZE_LO[p.ep];
    p.hashHi ^= ZE_HI[p.ep];
  }
  p.ep = flags & F_DOUBLE ? (from + to) >> 1 : -1;
  if (p.ep >= 0) {
    p.hashLo ^= ZE_LO[p.ep];
    p.hashHi ^= ZE_HI[p.ep];
  }

  p.halfmove = typeOf(pc) === PAWN || captured ? 0 : p.halfmove + 1;
  if (us === BLACK) p.fullmove++;
  p.side = (us ^ 1) as Side;
  p.hashLo ^= ZS_LO;
  p.hashHi ^= ZS_HI;
}

export function unmakeMove(p: ChessPosition, m: ChessMove): void {
  const b = p.board;
  const from = mFrom(m);
  const to = mTo(m);
  const flags = mFlags(m);
  const us = (p.side ^ 1) as Side;
  p.side = us;
  if (us === BLACK) p.fullmove--;

  const moved = mPromo(m) ? makePiece(PAWN, us) : b[to];
  const captured = p.uCaptured.pop() ?? 0;
  b[from] = moved;
  if (flags & F_EP) {
    b[to] = 0;
    b[to - (us === WHITE ? 16 : -16)] = captured;
  } else {
    b[to] = captured;
  }
  if (flags & F_CASTLE) {
    const [rf, rt] = to > from ? [from + 3, from + 1] : [from - 4, from - 1];
    b[rf] = b[rt];
    b[rt] = 0;
  }
  if (typeOf(moved) === KING) p.kings[us] = from;

  p.castling = p.uCastling.pop() ?? 0;
  p.ep = p.uEp.pop() ?? -1;
  p.halfmove = p.uHalfmove.pop() ?? 0;
  p.hashLo = p.histLo.pop() ?? 0;
  p.hashHi = p.histHi.pop() ?? 0;
}

function filterLegal(p: ChessPosition, moves: ChessMove[]): ChessMove[] {
  const us = p.side;
  const legal: ChessMove[] = [];
  for (const m of moves) {
    makeMove(p, m);
    if (!isAttacked(p, p.kings[us], us ^ 1)) legal.push(m);
    unmakeMove(p, m);
  }
  return legal;
}

export const legalMoves = (p: ChessPosition) => filterLegal(p, pseudoMoves(p));
export const noisyMoves = (p: ChessPosition) => filterLegal(p, pseudoMoves(p, true));

export function repetitions(p: ChessPosition): number {
  let n = 0;
  const len = p.histLo.length;
  for (let i = len - 2; i >= 0 && i >= len - p.halfmove; i -= 2) {
    if (p.histLo[i] === p.hashLo && p.histHi[i] === p.hashHi) n++;
  }
  return n;
}

export function insufficientMaterial(p: ChessPosition): boolean {
  let minors = 0;
  let bishopColours = 0; // bit 0: light-square bishop seen, bit 1: dark
  let knights = 0;
  for (let sq = 0; sq < 128; sq++) {
    if (!onBoard(sq)) {
      sq += 7;
      continue;
    }
    const t = typeOf(p.board[sq]);
    if (t === PAWN || t === ROOK || t === QUEEN) return false;
    if (t === KNIGHT) {
      knights++;
      minors++;
    } else if (t === BISHOP) {
      minors++;
      bishopColours |= (rankOf(sq) + fileOf(sq)) % 2 === 0 ? 2 : 1;
    }
  }
  if (minors <= 1) return true;
  // Only bishops, all on the same colour.
  return knights === 0 && bishopColours !== 3;
}
