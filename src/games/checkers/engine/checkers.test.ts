import { describe, expect, it } from 'vitest';
import { perft, play, replay, statusOf } from '../../../core/rules';
import { checkers } from '../index';
import { fromFen, moveFromPdn, toFen } from './notation';
import { initialPosition } from './position';

describe('checkers move generation', () => {
  // Published perft numbers for American checkers from the initial position.
  it.each([
    [1, 7],
    [2, 49],
    [3, 302],
    [4, 1469],
    [5, 7361],
    [6, 36768],
    [7, 179740],
  ])('perft(%i) = %i', (depth, nodes) => {
    expect(perft(checkers, initialPosition(), depth)).toBe(nodes);
  });

  it('make/unmake restores hash and board', () => {
    const p = initialPosition();
    const before = toFen(p);
    const h = [p.hashLo, p.hashHi];
    perft(checkers, p, 5);
    expect(toFen(p)).toBe(before);
    expect([p.hashLo, p.hashHi]).toEqual(h);
  });

  it('forces captures and generates multi-jumps', () => {
    // Black man on 9 can jump 14 then 23 (landing on 18 then 27).
    const p = fromFen('B:W14,23,30:B9');
    const moves = checkers.engine.legalMoves(p);
    expect(moves.map((m) => checkers.moveToCode(m))).toEqual(['9x18x27']);
  });

  it('a man crowned by a capture stops jumping', () => {
    const p = fromFen('B:W27,31,22:B23');
    const moves = checkers.engine.legalMoves(p).map((m) => checkers.moveToCode(m));
    // 23x32 crowns (jumping 27); it must not continue to jump 31 backwards.
    expect(moves).toContain('23x32');
    expect(moves.every((m) => !m.startsWith('23x32x'))).toBe(true);
  });

  it('kings capture backwards', () => {
    const p = fromFen('W:WK14:B9,10');
    const codes = checkers.engine.legalMoves(p).map((m) => checkers.moveToCode(m));
    expect(codes.sort()).toEqual(['14x5', '14x7']);
  });

  it('side without pieces loses', () => {
    const p = fromFen('B:W10:B6');
    const m = moveFromPdn(p, '6x15');
    if (!m) throw new Error('expected 6x15 to be legal');
    const next = play(checkers, p, m);
    expect(statusOf(checkers, next)).toEqual({
      kind: 'win',
      winner: 0,
      reason: 'all pieces captured',
    });
  });

  it('FEN round-trips and replay works', () => {
    const fen = 'W:WK3,21,22:B1,K12,5';
    expect(toFen(fromFen(fen))).toBe('W:WK3,21,22:B1,5,K12');
    const { positions } = replay(checkers, toFen(initialPosition()), ['11-15', '23-19', '8-11']);
    expect(positions).toHaveLength(4);
  });
});
