import { describe, expect, it } from 'vitest';
import { checkers } from '../games/checkers';
import { fromFen as checkersFen } from '../games/checkers/engine/notation';
import { chess } from '../games/chess';
import { fromFen } from '../games/chess/engine/notation';
import { type MovePath, resolveClick } from './moveInput';

// biome-ignore lint/suspicious/noExplicitAny: test helper over either game
const pathsOf = (def: any, p: unknown): MovePath<unknown>[] =>
  def.engine.legalMoves(p).map((m: unknown) => ({ m, path: def.board.movePath(m) }));

/** Feeds a click sequence through resolveClick, like the Board does. */
function clickThrough<M>(paths: MovePath<M>[], clicks: number[]) {
  let prefix: number[] = [];
  let last: ReturnType<typeof resolveClick<M>> = { kind: 'none' };
  for (const sq of clicks) {
    last = resolveClick(paths, prefix, sq);
    if (last.kind === 'select') prefix = last.prefix;
  }
  return { last, prefix };
}

describe('click-to-move resolution', () => {
  const pdn = (n: number) => n - 1; // PDN square -> checkers square id

  it('enters a checkers double jump hop by hop', () => {
    const paths = pathsOf(checkers, checkersFen('B:W14,23,30:B9'));
    const { last } = clickThrough(paths, [pdn(9), pdn(18), pdn(27)]);
    expect(last.kind).toBe('move');
    if (last.kind === 'move') expect(checkers.moveToCode(last.move as never)).toBe('9x18x27');
  });

  it('accepts the final square directly and ignores re-clicking the hopping piece', () => {
    const paths = pathsOf(checkers, checkersFen('B:W14,23,30:B9'));
    expect(clickThrough(paths, [pdn(9), pdn(27)]).last.kind).toBe('move');
    const mid = clickThrough(paths, [pdn(9), pdn(18), pdn(18)]);
    expect(mid.last.kind).toBe('none');
    expect(mid.prefix).toEqual([pdn(9), pdn(18)]);
  });

  it('clicking the origin mid-jump restarts the selection', () => {
    const paths = pathsOf(checkers, checkersFen('B:W14,23,30:B9'));
    expect(clickThrough(paths, [pdn(9), pdn(18), pdn(9)]).prefix).toEqual([pdn(9)]);
  });

  it('offers a chooser for chess promotion', () => {
    const p = fromFen('k7/4P3/8/8/8/8/8/K7 w - - 0 1');
    const paths = pathsOf(chess, p);
    const e7 = 6 * 16 + 4;
    const e8 = 7 * 16 + 4;
    const { last } = clickThrough(paths, [e7, e8]);
    expect(last.kind).toBe('choose');
    if (last.kind === 'choose') {
      expect(last.moves.map((m) => chess.choiceLabel(m as number)).sort()).toEqual([
        'Bishop',
        'Knight',
        'Queen',
        'Rook',
      ]);
    }
  });

  it('does not end a move early when the square also continues another route', () => {
    // Synthetic routes from 0: A ends at 5; B passes through 5 and continues to 9.
    const paths: MovePath<string>[] = [
      { m: 'A', path: [0, 3, 5] },
      { m: 'B', path: [0, 4, 5, 9] },
    ];
    const r = clickThrough(paths, [0, 5]).last;
    expect(r).toEqual({ kind: 'choose', moves: ['A', 'B'] });
    // Clicking the hops of route B explicitly still works without a chooser.
    expect(clickThrough(paths, [0, 4, 5, 9]).last).toEqual({ kind: 'move', move: 'B' });
  });

  it('asks when two different routes reach the same intermediate square', () => {
    const paths: MovePath<string>[] = [
      { m: 'A', path: [0, 3, 5, 7] },
      { m: 'B', path: [0, 4, 5, 8] },
    ];
    expect(clickThrough(paths, [0, 5]).last).toEqual({ kind: 'choose', moves: ['A', 'B'] });
    expect(clickThrough(paths, [0, 3, 5]).prefix).toEqual([0, 3, 5]);
  });

  it('selects, reselects and deselects pieces', () => {
    const paths = pathsOf(chess, chess.initial());
    const e2 = 0x14;
    const d2 = 0x13;
    expect(clickThrough(paths, [e2]).prefix).toEqual([e2]);
    expect(clickThrough(paths, [e2, d2]).prefix).toEqual([d2]);
    expect(clickThrough(paths, [e2, e2]).prefix).toEqual([]);
    expect(clickThrough(paths, [e2, 0x44]).prefix).toEqual([]); // e5: not a target
    expect(resolveClick(paths, [], -1).kind).toBe('none');
  });
});
