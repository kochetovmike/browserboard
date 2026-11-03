import { mulberry32 } from '../../../core/rules';
import type { Side } from '../../../core/types';

/**
 * American / English draughts on 32 playable squares.
 *
 * Square ids 0..31 correspond to PDN squares 1..32. Row 0 is the top of the board
 * (Black's home rows 0–2); Black (side 0) moves first and moves "down" (towards row 7).
 * Each colour/kind set is a 32-bit bitboard.
 */

export const BLACK: Side = 0;
export const WHITE: Side = 1;

export interface CheckersMove {
  from: number;
  to: number;
  /** Landing squares after `from`, ending with `to`. */
  path: number[];
  /** Bitmask of captured squares (0 for a simple move). */
  captures: number;
  /** Subset of `captures` that were kings. */
  capturedKings: number;
  wasKing: boolean;
  promotes: boolean;
}

export interface CheckersPosition {
  /** Bitboards indexed by side. */
  men: [number, number];
  kings: [number, number];
  side: Side;
  /** Plies since the last capture or man move (draw rule). */
  quiet: number;
  hashLo: number;
  hashHi: number;
  /** Hash history (positions before each move) for repetition detection. */
  histLo: number[];
  histHi: number[];
  /** Undo stack of `quiet` values. */
  undoQuiet: number[];
}

/** 40 moves each without a capture or man move. */
export const QUIET_PLY_LIMIT = 80;

export const rowOf = (sq: number) => sq >> 2;
export const colOf = (sq: number) => {
  const r = sq >> 2;
  return (sq & 3) * 2 + (r % 2 === 0 ? 1 : 0);
};
export const squareAt = (row: number, col: number): number => {
  if (row < 0 || row > 7 || col < 0 || col > 7 || (row + col) % 2 === 0) return -1;
  return row * 4 + (row % 2 === 0 ? (col - 1) >> 1 : col >> 1);
};

// Directions: 0 = up-left, 1 = up-right, 2 = down-left, 3 = down-right.
const DR = [-1, -1, 1, 1];
const DC = [-1, 1, -1, 1];
export const NEIGHBOR: number[][] = [];
export const JUMP: number[][] = [];
for (let sq = 0; sq < 32; sq++) {
  const r = rowOf(sq);
  const c = colOf(sq);
  NEIGHBOR.push(DR.map((dr, d) => squareAt(r + dr, c + DC[d])));
  JUMP.push(DR.map((dr, d) => squareAt(r + 2 * dr, c + 2 * DC[d])));
}
/** Forward directions for men of each side. */
export const MAN_DIRS: [number[], number[]] = [
  [2, 3],
  [0, 1],
];
const KING_DIRS = [0, 1, 2, 3];
/** Promotion row bitmasks per side. */
export const PROMO_ROW: [number, number] = [0xf0000000 | 0, 0x0000000f];

export const bit = (sq: number) => (1 << sq) | 0;

// Zobrist keys: [side*2 + isKing][sq]
const rnd = mulberry32(0xc0ffee);
const ZLO: number[][] = [];
const ZHI: number[][] = [];
for (let k = 0; k < 4; k++) {
  ZLO.push(Array.from({ length: 32 }, () => rnd() | 0));
  ZHI.push(Array.from({ length: 32 }, () => rnd() | 0));
}
const Z_SIDE_LO = rnd() | 0;
const Z_SIDE_HI = rnd() | 0;

function computeHash(p: CheckersPosition): void {
  let lo = 0;
  let hi = 0;
  for (let s = 0; s < 2; s++) {
    for (let k = 0; k < 2; k++) {
      let bb = k === 0 ? p.men[s] : p.kings[s];
      while (bb !== 0) {
        const sq = 31 - Math.clz32(bb);
        bb &= ~bit(sq);
        lo ^= ZLO[s * 2 + k][sq];
        hi ^= ZHI[s * 2 + k][sq];
      }
    }
  }
  if (p.side === 1) {
    lo ^= Z_SIDE_LO;
    hi ^= Z_SIDE_HI;
  }
  p.hashLo = lo;
  p.hashHi = hi;
}

export function createPosition(
  men: [number, number],
  kings: [number, number],
  side: Side,
  quiet = 0,
): CheckersPosition {
  const p: CheckersPosition = {
    men: [men[0] | 0, men[1] | 0],
    kings: [kings[0] | 0, kings[1] | 0],
    side,
    quiet,
    hashLo: 0,
    hashHi: 0,
    histLo: [],
    histHi: [],
    undoQuiet: [],
  };
  computeHash(p);
  return p;
}

export function initialPosition(): CheckersPosition {
  // Black on squares 1–12 (ids 0–11), White on 21–32 (ids 20–31).
  return createPosition([0x00000fff, 0xfff00000 | 0], [0, 0], BLACK);
}

export function clonePosition(p: CheckersPosition): CheckersPosition {
  return {
    men: [p.men[0], p.men[1]],
    kings: [p.kings[0], p.kings[1]],
    side: p.side,
    quiet: p.quiet,
    hashLo: p.hashLo,
    hashHi: p.hashHi,
    histLo: p.histLo.slice(),
    histHi: p.histHi.slice(),
    undoQuiet: p.undoQuiet.slice(),
  };
}

const occupied = (p: CheckersPosition) => p.men[0] | p.men[1] | p.kings[0] | p.kings[1];

function captureSearch(
  p: CheckersPosition,
  out: CheckersMove[],
  from: number,
  sq: number,
  isKing: boolean,
  empty: number,
  captured: number,
  capturedKings: number,
  path: number[],
): void {
  const s = p.side;
  const opp = p.men[s ^ 1] | p.kings[s ^ 1];
  const dirs = isKing ? KING_DIRS : MAN_DIRS[s];
  let extended = false;
  for (const d of dirs) {
    const over = NEIGHBOR[sq][d];
    const land = JUMP[sq][d];
    if (over < 0 || land < 0) continue;
    const ob = bit(over);
    if ((opp & ob) === 0 || (captured & ob) !== 0 || (empty & bit(land)) === 0) continue;
    extended = true;
    const nc = captured | ob;
    const nk = capturedKings | (p.kings[s ^ 1] & ob);
    path.push(land);
    // A man reaching the king row during a capture is crowned and the move ends.
    if (!isKing && (PROMO_ROW[s] & bit(land)) !== 0) {
      out.push({
        from,
        to: land,
        path: path.slice(),
        captures: nc,
        capturedKings: nk,
        wasKing: false,
        promotes: true,
      });
    } else {
      captureSearch(p, out, from, land, isKing, empty, nc, nk, path);
    }
    path.pop();
  }
  if (!extended && captured !== 0) {
    out.push({
      from,
      to: sq,
      path: path.slice(),
      captures: captured,
      capturedKings,
      wasKing: isKing,
      promotes: false,
    });
  }
}

export function generateCaptures(p: CheckersPosition): CheckersMove[] {
  const out: CheckersMove[] = [];
  const s = p.side;
  const all = occupied(p);
  for (let k = 0; k < 2; k++) {
    let bb = k === 0 ? p.men[s] : p.kings[s];
    while (bb !== 0) {
      const sq = 31 - Math.clz32(bb);
      bb &= ~bit(sq);
      const empty = ~all | bit(sq);
      captureSearch(p, out, sq, sq, k === 1, empty, 0, 0, []);
    }
  }
  return out;
}

export function hasCapture(p: CheckersPosition): boolean {
  const s = p.side;
  const opp = p.men[s ^ 1] | p.kings[s ^ 1];
  const empty = ~occupied(p);
  for (let k = 0; k < 2; k++) {
    let bb = k === 0 ? p.men[s] : p.kings[s];
    const dirs = k === 1 ? KING_DIRS : MAN_DIRS[s];
    while (bb !== 0) {
      const sq = 31 - Math.clz32(bb);
      bb &= ~bit(sq);
      for (const d of dirs) {
        const over = NEIGHBOR[sq][d];
        const land = JUMP[sq][d];
        if (over >= 0 && land >= 0 && (opp & bit(over)) !== 0 && (empty & bit(land)) !== 0)
          return true;
      }
    }
  }
  return false;
}

export function generateMoves(p: CheckersPosition): CheckersMove[] {
  const caps = generateCaptures(p);
  if (caps.length > 0) return caps;
  const out: CheckersMove[] = [];
  const s = p.side;
  const empty = ~occupied(p);
  for (let k = 0; k < 2; k++) {
    let bb = k === 0 ? p.men[s] : p.kings[s];
    const dirs = k === 1 ? KING_DIRS : MAN_DIRS[s];
    while (bb !== 0) {
      const sq = 31 - Math.clz32(bb);
      bb &= ~bit(sq);
      for (const d of dirs) {
        const to = NEIGHBOR[sq][d];
        if (to < 0 || (empty & bit(to)) === 0) continue;
        out.push({
          from: sq,
          to,
          path: [to],
          captures: 0,
          capturedKings: 0,
          wasKing: k === 1,
          promotes: k === 0 && (PROMO_ROW[s] & bit(to)) !== 0,
        });
      }
    }
  }
  return out;
}

function xorBits(p: CheckersPosition, zi: number, bb: number): void {
  while (bb !== 0) {
    const sq = 31 - Math.clz32(bb);
    bb &= ~bit(sq);
    p.hashLo ^= ZLO[zi][sq];
    p.hashHi ^= ZHI[zi][sq];
  }
}

/** Toggles the board effects of `m` (self-inverse apart from counters/side). */
function toggle(p: CheckersPosition, m: CheckersMove, s: Side): void {
  const fb = bit(m.from);
  const tb = bit(m.to);
  const o = s ^ 1;
  const fromK = m.wasKing ? 1 : 0;
  const toK = m.wasKing || m.promotes ? 1 : 0;
  if (fromK) p.kings[s] ^= fb;
  else p.men[s] ^= fb;
  if (toK) p.kings[s] ^= tb;
  else p.men[s] ^= tb;
  p.hashLo ^= ZLO[s * 2 + fromK][m.from] ^ ZLO[s * 2 + toK][m.to];
  p.hashHi ^= ZHI[s * 2 + fromK][m.from] ^ ZHI[s * 2 + toK][m.to];
  if (m.captures !== 0) {
    const capMen = m.captures & ~m.capturedKings;
    p.men[o] ^= capMen;
    p.kings[o] ^= m.capturedKings;
    xorBits(p, o * 2, capMen);
    xorBits(p, o * 2 + 1, m.capturedKings);
  }
  p.hashLo ^= Z_SIDE_LO;
  p.hashHi ^= Z_SIDE_HI;
}

export function makeMove(p: CheckersPosition, m: CheckersMove): void {
  p.histLo.push(p.hashLo);
  p.histHi.push(p.hashHi);
  p.undoQuiet.push(p.quiet);
  toggle(p, m, p.side);
  p.quiet = m.captures !== 0 || !m.wasKing ? 0 : p.quiet + 1;
  p.side = (p.side ^ 1) as Side;
}

export function unmakeMove(p: CheckersPosition, m: CheckersMove): void {
  p.side = (p.side ^ 1) as Side;
  toggle(p, m, p.side);
  p.quiet = p.undoQuiet.pop() ?? 0;
  p.histLo.pop();
  p.histHi.pop();
}

/** Number of earlier occurrences of the current position (same side to move). */
export function repetitions(p: CheckersPosition): number {
  let n = 0;
  const len = p.histLo.length;
  // Only positions since the last irreversible move can repeat.
  for (let i = len - 2; i >= 0 && i >= len - p.quiet; i -= 2) {
    if (p.histLo[i] === p.hashLo && p.histHi[i] === p.hashHi) n++;
  }
  return n;
}

export const popcount = (x: number) => {
  let v = x >>> 0;
  v -= (v >>> 1) & 0x55555555;
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
};
