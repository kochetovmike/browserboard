import type { Side } from '../../../core/types';
import {
  bit,
  type CheckersMove,
  type CheckersPosition,
  createPosition,
  generateMoves,
} from './position';

/** PDN move text: "11-15" or "15x24x31" (squares are 1-based). */
export function moveToPdn(m: CheckersMove): string {
  if (m.captures === 0) return `${m.from + 1}-${m.to + 1}`;
  return [m.from, ...m.path].map((s) => s + 1).join('x');
}

/** Accepts full ("11x18x25") or short ("11x25", "11-15") notation, if unambiguous. */
export function moveFromPdn(p: CheckersPosition, text: string): CheckersMove | null {
  const t = text.trim();
  const moves = generateMoves(p);
  const exact = moves.find((m) => moveToPdn(m) === t);
  if (exact) return exact;
  const parts = t.split(/[-x]/).map((n) => Number.parseInt(n, 10) - 1);
  if (parts.length < 2 || parts.some(Number.isNaN)) return null;
  const from = parts[0];
  const to = parts[parts.length - 1];
  const matches = moves.filter((m) => m.from === from && m.to === to);
  return matches.length === 1 ? matches[0] : null;
}

/** PDN FEN, e.g. "B:W21,22,K30:B1,2,3". */
export function toFen(p: CheckersPosition): string {
  const list = (s: Side) => {
    const out: string[] = [];
    for (let sq = 0; sq < 32; sq++) {
      if (p.men[s] & bit(sq)) out.push(String(sq + 1));
      else if (p.kings[s] & bit(sq)) out.push(`K${sq + 1}`);
    }
    return out.join(',');
  };
  return `${p.side === 0 ? 'B' : 'W'}:W${list(1)}:B${list(0)}`;
}

export function fromFen(fen: string): CheckersPosition {
  const fields = fen.trim().replace(/\.$/, '').split(':');
  if (fields.length < 3) throw new Error(`Bad checkers FEN: ${fen}`);
  const turn = fields[0].toUpperCase();
  if (turn !== 'B' && turn !== 'W') throw new Error(`Bad side to move: ${fen}`);
  const men: [number, number] = [0, 0];
  const kings: [number, number] = [0, 0];
  for (const f of fields.slice(1)) {
    const colour = f[0].toUpperCase();
    const s: Side = colour === 'B' ? 0 : 1;
    if (colour !== 'B' && colour !== 'W') throw new Error(`Bad colour in FEN: ${fen}`);
    for (const tok of f.slice(1).split(',').filter(Boolean)) {
      const king = tok[0].toUpperCase() === 'K';
      const n = Number.parseInt(king ? tok.slice(1) : tok, 10);
      if (!(n >= 1 && n <= 32)) throw new Error(`Bad square in FEN: ${tok}`);
      if (king) kings[s] |= bit(n - 1);
      else men[s] |= bit(n - 1);
    }
  }
  return createPosition(men, kings, turn === 'B' ? 0 : 1);
}
