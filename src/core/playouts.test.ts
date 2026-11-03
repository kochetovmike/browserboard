import { describe, expect, it } from 'vitest';
import { checkers } from '../games/checkers';
import { chess } from '../games/chess';
import { play, statusOf } from './rules';
import type { GameDefinition } from './types';

const rng = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647;
};

/**
 * Random full games: at every ply, make/unmake must restore the position exactly,
 * the incremental hash must equal a freshly computed one, notation must round-trip,
 * and the game must end with a valid status.
 */
function randomGames<P, M>(def: GameDefinition<P, M>, games: number, maxPlies: number) {
  const outcomes: Record<string, number> = {};
  for (let g = 0; g < games; g++) {
    const rand = rng(1000 + g);
    let p = def.initial();
    for (let ply = 0; ply < maxPlies; ply++) {
      const status = statusOf(def, p);
      if (status.kind !== 'ongoing') {
        const key = `${status.kind}:${status.reason}`;
        outcomes[key] = (outcomes[key] ?? 0) + 1;
        break;
      }
      const moves = def.engine.legalMoves(p);
      const codes = moves.map((m) => def.moveToCode(m));
      expect(new Set(codes).size).toBe(codes.length); // no duplicate moves
      const m = moves[Math.floor(rand() * moves.length)];

      const before = def.serialize(p);
      const work = def.engine.clone(p);
      def.engine.make(work, m);
      def.engine.unmake(work, m);
      expect(def.serialize(work)).toBe(before);
      expect([def.engine.hashLo(work), def.engine.hashHi(work)]).toEqual([
        def.engine.hashLo(p),
        def.engine.hashHi(p),
      ]);

      expect(def.moveFromCode(p, def.moveToCode(m))).toEqual(m);
      def.notation(p, m); // must not throw
      p = play(def, p, m);

      const fresh = def.parse(def.serialize(p));
      expect([def.engine.hashLo(p), def.engine.hashHi(p)]).toEqual([
        def.engine.hashLo(fresh),
        def.engine.hashHi(fresh),
      ]);
    }
  }
  return outcomes;
}

describe('random playouts keep engine invariants', () => {
  it('checkers', () => {
    const outcomes = randomGames(checkers, 40, 400);
    expect(Object.keys(outcomes).length).toBeGreaterThan(0);
  });

  it('chess', () => {
    const outcomes = randomGames(chess, 12, 300);
    expect(Object.keys(outcomes).length).toBeGreaterThan(0);
  });
});
