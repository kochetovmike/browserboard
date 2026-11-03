import { describe, expect, it } from 'vitest';
import { perft, play, replay, statusOf } from '../../../core/rules';
import { chess } from '../index';
import { fromFen, fromSan, START_FEN, toFen, toSan } from './notation';

const KIWIPETE = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
const POS3 = '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1';
const POS4 = 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1';
const POS5 = 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8';

describe('chess move generation (perft)', () => {
  it.each([
    ['start', START_FEN, [20, 400, 8902, 197281]],
    ['kiwipete', KIWIPETE, [48, 2039, 97862]],
    ['position 3', POS3, [14, 191, 2812, 43238]],
    ['position 4', POS4, [6, 264, 9467]],
    ['position 5', POS5, [44, 1486, 62379]],
  ] as const)('%s', (_name, fen, counts) => {
    const p = fromFen(fen);
    counts.forEach((n, i) => {
      expect(perft(chess, p, i + 1)).toBe(n);
    });
    // make/unmake left the position untouched
    expect(toFen(p)).toBe(fen);
  });

  it('incremental hash matches a fresh hash after a sequence of moves', () => {
    const { positions } = replay(chess, KIWIPETE, ['e1g1', 'h3g2', 'a1b1', 'g2f1q', 'g1f1']);
    const last = positions[positions.length - 1];
    const fresh = fromFen(toFen(last));
    expect([last.hashLo, last.hashHi]).toEqual([fresh.hashLo, fresh.hashHi]);
  });
});

describe('chess notation and rules', () => {
  it('produces SAN with disambiguation, check and mate', () => {
    const p = fromFen('7k/8/8/8/8/8/8/R5RK w - - 0 1');
    const m = fromSan(p, 'Rab1');
    expect(m).not.toBeNull();
    expect(toSan(p, m as number)).toBe('Rab1');
    const mate = fromFen('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1');
    const ra8 = fromSan(mate, 'Ra8');
    expect(toSan(mate, ra8 as number)).toBe('Ra8#');
    expect(statusOf(chess, play(chess, mate, ra8 as number))).toEqual({
      kind: 'win',
      winner: 0,
      reason: 'checkmate',
    });
  });

  it('detects stalemate, insufficient material and threefold repetition', () => {
    expect(statusOf(chess, fromFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'))).toEqual({
      kind: 'draw',
      reason: 'stalemate',
    });
    expect(statusOf(chess, fromFen('7k/8/8/8/8/8/8/5BK1 b - - 0 1')).kind).toBe('draw');
    const shuffle = ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8'];
    const { positions } = replay(chess, START_FEN, shuffle);
    expect(statusOf(chess, positions[positions.length - 1])).toEqual({
      kind: 'draw',
      reason: 'threefold repetition',
    });
  });

  it('round-trips FEN', () => {
    for (const fen of [START_FEN, KIWIPETE, POS3, POS4, POS5])
      expect(toFen(fromFen(fen))).toBe(fen);
  });
});
