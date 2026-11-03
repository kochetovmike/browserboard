import { bit, type CheckersPosition, colOf, popcount, rowOf } from './position';

const MAN = 100;
const KING = 160;

// Per-square bonus for men, from Black's perspective (Black advances towards row 7).
const MAN_PST: number[] = [];
const KING_PST: number[] = [];
for (let sq = 0; sq < 32; sq++) {
  const r = rowOf(sq);
  const c = colOf(sq);
  const centre = c >= 2 && c <= 5 ? 6 : c === 0 || c === 7 ? -4 : 0;
  // Advancing is good, but keep the back row as a guard until late.
  const advance = r * 4;
  MAN_PST.push(advance + (r >= 2 && r <= 5 ? centre : 0));
  const kc = (c >= 2 && c <= 5 ? 8 : 0) + (r >= 2 && r <= 5 ? 8 : 0);
  KING_PST.push(kc);
}
const mirror = (sq: number) => 31 - sq;

// Black's back-row guard squares (PDN 1 and 3 hold the classic bridge); White mirrored.
const BACK_GUARD: [number, number] = [bit(0) | bit(2), bit(31) | bit(29)];

function sideScore(p: CheckersPosition, s: 0 | 1, totalPieces: number): number {
  let score = 0;
  let bb = p.men[s];
  while (bb !== 0) {
    const sq = 31 - Math.clz32(bb);
    bb &= ~bit(sq);
    score += MAN + MAN_PST[s === 0 ? sq : mirror(sq)];
  }
  bb = p.kings[s];
  while (bb !== 0) {
    const sq = 31 - Math.clz32(bb);
    bb &= ~bit(sq);
    score += KING + KING_PST[sq];
  }
  if (totalPieces > 12) score += popcount(p.men[s] & BACK_GUARD[s]) * 12;
  return score;
}

/** Static evaluation from the side to move's perspective. */
export function evaluate(p: CheckersPosition): number {
  const total =
    popcount(p.men[0]) + popcount(p.men[1]) + popcount(p.kings[0]) + popcount(p.kings[1]);
  const black = sideScore(p, 0, total);
  const white = sideScore(p, 1, total);
  let diff = black - white;
  // When ahead, trading down is good: scale the lead as material comes off.
  if (diff !== 0) diff += Math.sign(diff) * (24 - total) * 3;
  // Endgame: kings of the stronger side should hunt the remaining pieces.
  if (total <= 8 && Math.abs(diff) >= 100) {
    const strong = diff > 0 ? 0 : 1;
    diff += (strong === 0 ? 1 : -1) * huntBonus(p, strong);
  }
  return p.side === 0 ? diff : -diff;
}

function huntBonus(p: CheckersPosition, strong: 0 | 1): number {
  let kings = p.kings[strong];
  const weak = p.men[strong ^ 1] | p.kings[strong ^ 1];
  let bonus = 0;
  while (kings !== 0) {
    const k = 31 - Math.clz32(kings);
    kings &= ~bit(k);
    let best = 14;
    let w = weak;
    while (w !== 0) {
      const t = 31 - Math.clz32(w);
      w &= ~bit(t);
      const d = Math.max(Math.abs(rowOf(k) - rowOf(t)), Math.abs(colOf(k) - colOf(t)));
      if (d < best) best = d;
    }
    bonus += (14 - best) * 2;
  }
  return bonus;
}
