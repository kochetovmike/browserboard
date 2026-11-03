import type { GameDefinition, GameStatus } from './types';
import { other } from './types';

/**
 * Immutable helpers used by the UI and session layers. They clone before mutating, so
 * positions held in UI state are never changed underneath it.
 */
export function play<P, M>(def: GameDefinition<P, M>, p: P, m: M): P {
  const next = def.engine.clone(p);
  def.engine.make(next, m);
  return next;
}

export function statusOf<P, M>(def: GameDefinition<P, M>, p: P): GameStatus {
  const e = def.engine;
  const moves = e.legalMoves(p);
  const side = e.sideToMove(p);
  if (moves.length === 0) {
    const r = e.noMovesResult(p);
    return r.kind === 'loss'
      ? { kind: 'win', winner: other(side), reason: r.reason }
      : { kind: 'draw', reason: r.reason };
  }
  const draw = e.drawReason(p, true);
  if (draw) return { kind: 'draw', reason: draw };
  return { kind: 'ongoing' };
}

/** Rebuilds a position (with full repetition history) from a start position and move codes. */
export function replay<P, M>(
  def: GameDefinition<P, M>,
  startSerialized: string,
  codes: readonly string[],
): { positions: P[]; moves: M[] } {
  const start = def.parse(startSerialized);
  const positions: P[] = [start];
  const moves: M[] = [];
  let cur = start;
  for (const code of codes) {
    const m = def.moveFromCode(cur, code);
    if (m === null) throw new Error(`Illegal move "${code}" during replay`);
    cur = play(def, cur, m);
    moves.push(m);
    positions.push(cur);
  }
  return { positions, moves };
}

/** Deterministic 32-bit PRNG used for Zobrist keys. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
}

/** Counts leaf nodes at `depth` — the standard move-generator correctness test. */
export function perft<P, M>(def: GameDefinition<P, M>, p: P, depth: number): number {
  const e = def.engine;
  if (depth === 0) return 1;
  const moves = e.legalMoves(p);
  if (depth === 1) return moves.length;
  let n = 0;
  for (const m of moves) {
    e.make(p, m);
    n += perft(def, p, depth - 1);
    e.unmake(p, m);
  }
  return n;
}
