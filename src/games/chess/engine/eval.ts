import {
  BISHOP,
  type ChessMove,
  type ChessPosition,
  colorOf,
  F_EP,
  fileOf,
  KING,
  mFlags,
  mFrom,
  mPromo,
  mTo,
  onBoard,
  rankOf,
  typeOf,
  WHITE,
} from './position';

export const VALUE = [0, 100, 320, 330, 500, 900, 0];
const PHASE = [0, 0, 1, 1, 2, 4, 0];

// Piece-square tables (simplified evaluation function), a8..h1 from White's view.
// biome-ignore format: keep the 8x8 table layout
const PST: number[][] = [
  [],
  [ 0,  0,  0,  0,  0,  0,  0,  0,
   50, 50, 50, 50, 50, 50, 50, 50,
   10, 10, 20, 30, 30, 20, 10, 10,
    5,  5, 10, 25, 25, 10,  5,  5,
    0,  0,  0, 20, 20,  0,  0,  0,
    5, -5,-10,  0,  0,-10, -5,  5,
    5, 10, 10,-20,-20, 10, 10,  5,
    0,  0,  0,  0,  0,  0,  0,  0],
  [-50,-40,-30,-30,-30,-30,-40,-50,
   -40,-20,  0,  0,  0,  0,-20,-40,
   -30,  0, 10, 15, 15, 10,  0,-30,
   -30,  5, 15, 20, 20, 15,  5,-30,
   -30,  0, 15, 20, 20, 15,  0,-30,
   -30,  5, 10, 15, 15, 10,  5,-30,
   -40,-20,  0,  5,  5,  0,-20,-40,
   -50,-40,-30,-30,-30,-30,-40,-50],
  [-20,-10,-10,-10,-10,-10,-10,-20,
   -10,  0,  0,  0,  0,  0,  0,-10,
   -10,  0,  5, 10, 10,  5,  0,-10,
   -10,  5,  5, 10, 10,  5,  5,-10,
   -10,  0, 10, 10, 10, 10,  0,-10,
   -10, 10, 10, 10, 10, 10, 10,-10,
   -10,  5,  0,  0,  0,  0,  5,-10,
   -20,-10,-10,-10,-10,-10,-10,-20],
  [ 0,  0,  0,  0,  0,  0,  0,  0,
    5, 10, 10, 10, 10, 10, 10,  5,
   -5,  0,  0,  0,  0,  0,  0, -5,
   -5,  0,  0,  0,  0,  0,  0, -5,
   -5,  0,  0,  0,  0,  0,  0, -5,
   -5,  0,  0,  0,  0,  0,  0, -5,
   -5,  0,  0,  0,  0,  0,  0, -5,
    0,  0,  0,  5,  5,  0,  0,  0],
  [-20,-10,-10, -5, -5,-10,-10,-20,
   -10,  0,  0,  0,  0,  0,  0,-10,
   -10,  0,  5,  5,  5,  5,  0,-10,
    -5,  0,  5,  5,  5,  5,  0, -5,
     0,  0,  5,  5,  5,  5,  0, -5,
   -10,  5,  5,  5,  5,  5,  0,-10,
   -10,  0,  5,  0,  0,  0,  0,-10,
   -20,-10,-10, -5, -5,-10,-10,-20],
  [-30,-40,-40,-50,-50,-40,-40,-30,
   -30,-40,-40,-50,-50,-40,-40,-30,
   -30,-40,-40,-50,-50,-40,-40,-30,
   -30,-40,-40,-50,-50,-40,-40,-30,
   -20,-30,-30,-40,-40,-30,-30,-20,
   -10,-20,-20,-20,-20,-20,-20,-10,
    20, 20,  0,  0,  0,  0, 20, 20,
    20, 30, 10,  0,  0, 10, 30, 20],
];
// biome-ignore format: keep the 8x8 table layout
const KING_END = [
  -50,-40,-30,-20,-20,-30,-40,-50,
  -30,-20,-10,  0,  0,-10,-20,-30,
  -30,-10, 20, 30, 30, 20,-10,-30,
  -30,-10, 30, 40, 40, 30,-10,-30,
  -30,-10, 30, 40, 40, 30,-10,-30,
  -30,-10, 20, 30, 30, 20,-10,-30,
  -30,-30,  0,  0,  0,  0,-30,-30,
  -50,-30,-30,-30,-30,-30,-30,-50,
];

const pstIndex = (sq: number, colour: number) =>
  colour === WHITE ? (7 - rankOf(sq)) * 8 + fileOf(sq) : rankOf(sq) * 8 + fileOf(sq);

const centreDist = (sq: number) =>
  Math.max(3 - Math.min(fileOf(sq), 7 - fileOf(sq)), 3 - Math.min(rankOf(sq), 7 - rankOf(sq)));

/** Tapered material + PST evaluation, side-to-move perspective. */
export function evaluate(p: ChessPosition): number {
  const b = p.board;
  let mg = 0;
  const material = [0, 0];
  let phase = 0;
  const bishops = [0, 0];
  const kingMg = [0, 0];
  const kingEg = [0, 0];
  for (let sq = 0; sq < 128; sq++) {
    if (!onBoard(sq)) {
      sq += 7;
      continue;
    }
    const pc = b[sq];
    if (!pc) continue;
    const t = typeOf(pc);
    const c = colorOf(pc);
    const sign = c === WHITE ? 1 : -1;
    const idx = pstIndex(sq, c);
    if (t === KING) {
      kingMg[c] = PST[KING][idx];
      kingEg[c] = KING_END[idx];
      continue;
    }
    material[c] += VALUE[t];
    phase += PHASE[t];
    if (t === BISHOP) bishops[c]++;
    mg += sign * (VALUE[t] + PST[t][idx]);
  }
  const ph = Math.min(phase, 24);
  mg += ((kingMg[0] - kingMg[1]) * ph + (kingEg[0] - kingEg[1]) * (24 - ph)) / 24;
  if (bishops[0] >= 2) mg += 30;
  if (bishops[1] >= 2) mg -= 30;

  // Mop-up: with a clear material lead in the endgame, drive the enemy king to the edge.
  const lead = material[0] - material[1];
  if (ph <= 8 && Math.abs(lead) >= 300) {
    const strong = lead > 0 ? 0 : 1;
    const ks = p.kings[strong];
    const kw = p.kings[strong ^ 1];
    const dist = Math.abs(fileOf(ks) - fileOf(kw)) + Math.abs(rankOf(ks) - rankOf(kw));
    const bonus = centreDist(kw) * 10 + (14 - dist) * 4;
    mg += strong === 0 ? bonus : -bonus;
  }
  const score = Math.round(mg);
  return p.side === WHITE ? score : -score;
}

/** MVV-LVA ordering score. */
export function captureScore(p: ChessPosition, m: ChessMove): number {
  const pr = mPromo(m);
  let s = pr ? VALUE[pr] : 0;
  const flags = mFlags(m);
  if (flags & F_EP) return s + 100 * 10 - 1;
  const victim = p.board[mTo(m)];
  if (victim) s += VALUE[typeOf(victim)] * 10 - VALUE[typeOf(p.board[mFrom(m)])] / 10;
  return s;
}
