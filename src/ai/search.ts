import type { AiLevel, Engine } from '../core/types';

/**
 * Game-agnostic search: negamax + alpha-beta, iterative deepening, transposition table,
 * killer/history move ordering and quiescence. Knows nothing about any specific game.
 */

export const MATE = 1_000_000;
const MATE_BOUND = MATE - 1000;
const INF = MATE + 1;

const EXACT = 0;
const LOWER = 1;
const UPPER = 2;
const MAX_PLY = 96;
const QS_MAX_PLY = 32;

export interface SearchResult<M> {
  move: M | null;
  score: number;
  depth: number;
  nodes: number;
}

export interface SearchOptions {
  maxDepth: number;
  timeMs: number;
  /** Pick randomly among root moves within this many points of the best (0 = best only). */
  noise?: number;
  random?: () => number;
  ttBits?: number;
  now?: () => number;
}

class Timeout extends Error {}

class TT {
  readonly mask: number;
  readonly lo: Int32Array;
  readonly hi: Int32Array;
  readonly score: Int32Array;
  readonly move: Int32Array;
  readonly depth: Int8Array;
  readonly flag: Int8Array;
  constructor(bits: number) {
    const n = 1 << bits;
    this.mask = n - 1;
    this.lo = new Int32Array(n);
    this.hi = new Int32Array(n);
    this.score = new Int32Array(n);
    this.move = new Int32Array(n).fill(-1);
    this.depth = new Int8Array(n).fill(-1);
    this.flag = new Int8Array(n);
  }
}

// Mate scores are stored relative to the node so they stay correct across plies.
const toTT = (s: number, ply: number) => (s > MATE_BOUND ? s + ply : s < -MATE_BOUND ? s - ply : s);
const fromTT = (s: number, ply: number) =>
  s > MATE_BOUND ? s - ply : s < -MATE_BOUND ? s + ply : s;

export function searchBestMove<P, M>(
  engine: Engine<P, M>,
  root: P,
  opts: SearchOptions,
): SearchResult<M> {
  const now = opts.now ?? (() => performance.now());
  const random = opts.random ?? Math.random;
  const deadline = now() + opts.timeMs;
  const tt = new TT(opts.ttBits ?? 18);
  const killers = new Int32Array(MAX_PLY * 2).fill(-1);
  const history = new Int32Array(1 << 12);
  let nodes = 0;

  const checkTime = () => {
    if ((nodes & 1023) === 0 && now() > deadline) {
      throw new Timeout();
    }
  };

  const order = (p: P, moves: M[], ttMove: number, ply: number): M[] => {
    const k0 = killers[ply * 2];
    const k1 = killers[ply * 2 + 1];
    const scored = moves.map((m) => {
      const id = engine.moveId(m);
      let s: number;
      if (id === ttMove) s = 1e9;
      else {
        const cap = engine.captureScore(p, m);
        if (cap > 0) s = 1e7 + cap;
        else if (id === k0) s = 9e6;
        else if (id === k1) s = 8e6;
        else s = history[id & 0xfff];
      }
      return { m, s };
    });
    scored.sort((a, b) => b.s - a.s);
    return scored.map((x) => x.m);
  };

  const quiesce = (p: P, alpha: number, beta: number, ply: number): number => {
    nodes++;
    checkTime();
    const forced = engine.forcedNoisy(p);
    let moves: M[];
    if (forced) {
      moves = engine.legalMoves(p);
      if (moves.length === 0) {
        const r = engine.noMovesResult(p);
        return r.kind === 'loss' ? -MATE + ply : 0;
      }
    } else {
      const stand = engine.evaluate(p);
      if (stand >= beta || ply >= QS_MAX_PLY) return stand;
      if (stand > alpha) alpha = stand;
      moves = engine.noisyMoves(p);
    }
    if (ply >= QS_MAX_PLY) return engine.evaluate(p);
    moves = order(p, moves, -1, Math.min(ply, MAX_PLY - 1));
    for (const m of moves) {
      engine.make(p, m);
      const s = -quiesce(p, -beta, -alpha, ply + 1);
      engine.unmake(p, m);
      if (s >= beta) return s;
      if (s > alpha) alpha = s;
    }
    return alpha;
  };

  const negamax = (p: P, depth: number, alpha: number, beta: number, ply: number): number => {
    nodes++;
    checkTime();
    if (ply > 0 && engine.drawReason(p, false) !== null) return 0;
    if (ply >= MAX_PLY - 1) return engine.evaluate(p);

    const inExt = engine.extend?.(p) ?? false;
    if (inExt) depth++;
    if (depth <= 0) return quiesce(p, alpha, beta, ply);

    const lo = engine.hashLo(p);
    const hi = engine.hashHi(p);
    const idx = lo & tt.mask;
    let ttMove = -1;
    if (tt.lo[idx] === lo && tt.hi[idx] === hi && tt.depth[idx] >= 0) {
      ttMove = tt.move[idx];
      if (ply > 0 && tt.depth[idx] >= depth) {
        const s = fromTT(tt.score[idx], ply);
        const f = tt.flag[idx];
        if (f === EXACT) return s;
        if (f === LOWER && s >= beta) return s;
        if (f === UPPER && s <= alpha) return s;
      }
    }

    const legal = engine.legalMoves(p);
    if (legal.length === 0) {
      const r = engine.noMovesResult(p);
      return r.kind === 'loss' ? -MATE + ply : 0;
    }
    const moves = order(p, legal, ttMove, ply);
    const alpha0 = alpha;
    let best = -INF;
    let bestId = -1;
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      engine.make(p, m);
      let s: number;
      if (i === 0) {
        s = -negamax(p, depth - 1, -beta, -alpha, ply + 1);
      } else {
        // Principal variation search: null window first, re-search on fail-high.
        s = -negamax(p, depth - 1, -alpha - 1, -alpha, ply + 1);
        if (s > alpha && s < beta) s = -negamax(p, depth - 1, -beta, -alpha, ply + 1);
      }
      engine.unmake(p, m);
      if (s > best) {
        best = s;
        bestId = engine.moveId(m);
      }
      if (s > alpha) alpha = s;
      if (alpha >= beta) {
        if (engine.captureScore(p, m) === 0) {
          const id = engine.moveId(m);
          if (killers[ply * 2] !== id) {
            killers[ply * 2 + 1] = killers[ply * 2];
            killers[ply * 2] = id;
          }
          history[id & 0xfff] += depth * depth;
        }
        break;
      }
    }

    tt.lo[idx] = lo;
    tt.hi[idx] = hi;
    tt.depth[idx] = Math.min(depth, 127);
    tt.move[idx] = bestId;
    tt.score[idx] = toTT(best, ply);
    tt.flag[idx] = best <= alpha0 ? UPPER : best >= beta ? LOWER : EXACT;
    return best;
  };

  const rootMoves = engine.legalMoves(root);
  if (rootMoves.length === 0) return { move: null, score: 0, depth: 0, nodes: 0 };
  if (rootMoves.length === 1) return { move: rootMoves[0], score: 0, depth: 0, nodes: 0 };

  const noise = opts.noise ?? 0;
  let bestMove = rootMoves[0];
  let bestScore = -INF;
  let completedDepth = 0;
  let scores: { m: M; s: number }[] = [];
  const p = engine.clone(root);

  for (let depth = 1; depth <= opts.maxDepth; depth++) {
    try {
      const ordered = order(p, rootMoves, engine.moveId(bestMove), 0);
      const iter: { m: M; s: number }[] = [];
      let alpha = -INF;
      for (const m of ordered) {
        engine.make(p, m);
        // With noise we need exact scores for every root move (full window).
        const s =
          noise > 0
            ? -negamax(p, depth - 1, -INF, INF, 1)
            : -negamax(p, depth - 1, -INF, -alpha, 1);
        engine.unmake(p, m);
        iter.push({ m, s });
        if (s > alpha) alpha = s;
      }
      iter.sort((a, b) => b.s - a.s);
      scores = iter;
      bestMove = iter[0].m;
      bestScore = iter[0].s;
      completedDepth = depth;
      if (Math.abs(bestScore) > MATE_BOUND) break; // forced mate found
    } catch (e) {
      if (!(e instanceof Timeout)) throw e;
      // The interrupted iteration is discarded; `p` is a private clone, so the
      // moves left made by the unwinding exception do not matter.
      break;
    }
    if (now() > deadline) break;
  }

  if (noise > 0 && scores.length > 1) {
    const top = scores[0].s;
    // Never "randomly" walk into a forced mate or skip a mate we found.
    if (Math.abs(top) < MATE_BOUND) {
      const candidates = scores.filter((x) => x.s >= top - noise);
      // Bias towards better moves: weight decreases linearly with the deficit.
      const weights = candidates.map((x) => noise + 1 - (top - x.s));
      const total = weights.reduce((a, b) => a + b, 0);
      let r = random() * total;
      for (let i = 0; i < candidates.length; i++) {
        r -= weights[i];
        if (r <= 0) {
          bestMove = candidates[i].m;
          bestScore = candidates[i].s;
          break;
        }
      }
    }
  }

  return { move: bestMove, score: bestScore, depth: completedDepth, nodes };
}

export function searchWithLevel<P, M>(
  engine: Engine<P, M>,
  root: P,
  level: AiLevel,
  random?: () => number,
): SearchResult<M> {
  return searchBestMove(engine, root, {
    maxDepth: level.maxDepth,
    timeMs: level.timeMs,
    noise: level.noise,
    random,
  });
}
