import { describe, expect, it } from 'vitest';
import { replay } from '../core/rules';
import { checkers } from '../games/checkers';
import { fromFen as checkersFen } from '../games/checkers/engine/notation';
import { chess } from '../games/chess';
import { fromFen } from '../games/chess/engine/notation';
import { MATE, searchBestMove } from './search';

const seeded = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};

describe('generic search on chess', () => {
  it('finds mate in one', () => {
    const p = fromFen('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1');
    const r = searchBestMove(chess.engine, p, { maxDepth: 3, timeMs: 5000 });
    expect(chess.moveToCode(r.move as number)).toBe('a1a8');
    expect(r.score).toBeGreaterThan(MATE - 10);
  });

  it('finds mate in two', () => {
    // Two rooks against a bare king: forced mate in two.
    const p = fromFen('k7/8/1K6/8/8/8/8/6RR w - - 0 1');
    const r = searchBestMove(chess.engine, p, { maxDepth: 5, timeMs: 5000 });
    expect(r.score).toBeGreaterThan(MATE - 10);
  });

  it('wins free material', () => {
    // Black queen hangs on d5.
    const p = fromFen('4k3/8/8/3q4/8/8/3R4/4K3 w - - 0 1');
    const r = searchBestMove(chess.engine, p, { maxDepth: 3, timeMs: 5000 });
    expect(chess.moveToCode(r.move as number)).toBe('d2d5');
  });

  it('does not mutate the root position and returns legal moves under a tiny time budget', () => {
    const { positions } = replay(chess, chess.serialize(chess.initial()), ['e2e4', 'e7e5']);
    const p = positions[2];
    const before = chess.serialize(p);
    const r = searchBestMove(chess.engine, p, { maxDepth: 64, timeMs: 30 });
    expect(chess.serialize(p)).toBe(before);
    expect(chess.engine.legalMoves(p)).toContain(r.move);
  });

  it('noise only picks among near-best moves and never skips a mate', () => {
    const p = fromFen('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1');
    for (let i = 0; i < 5; i++) {
      const r = searchBestMove(chess.engine, p, {
        maxDepth: 2,
        timeMs: 5000,
        noise: 300,
        random: seeded(i + 1),
      });
      expect(chess.moveToCode(r.move as number)).toBe('a1a8');
    }
  });
});

describe('generic search on checkers', () => {
  it('takes the double jump', () => {
    const p = checkersFen('B:W14,23,30,31:B9,1');
    const r = searchBestMove(checkers.engine, p, { maxDepth: 4, timeMs: 5000 });
    expect(r.move && checkers.moveToCode(r.move)).toBe('9x18x27');
  });

  it('plays a legal opening move within the time budget', () => {
    const p = checkers.initial();
    const t0 = performance.now();
    const r = searchBestMove(checkers.engine, p, { maxDepth: 64, timeMs: 200 });
    expect(performance.now() - t0).toBeLessThan(1500);
    expect(checkers.engine.legalMoves(p)).toContainEqual(r.move);
    expect(r.depth).toBeGreaterThan(3);
  });
});
