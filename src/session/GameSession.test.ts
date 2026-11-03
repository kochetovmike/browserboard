import { describe, expect, it } from 'vitest';
import { checkers } from '../games/checkers';
import { chess } from '../games/chess';
import { GameSession } from './GameSession';

const tick = () => new Promise((r) => setTimeout(r, 0));

const legalByCode = <P, M>(s: GameSession<P, M>, code: string): M => {
  const m = s.def.moveFromCode(s.current.value, code);
  if (m === null) throw new Error(`illegal ${code}`);
  return m;
};

describe('GameSession (hot-seat)', () => {
  it('alternates turns, records notation and undoes one ply at a time', async () => {
    const s = new GameSession(
      chess,
      { gameId: 'chess', mode: 'hotseat', humanSide: 0, level: 3 },
      chess.serialize(chess.initial()),
    );
    s.begin();
    expect(s.submit(legalByCode(s, 'e2e4'))).toBe(true);
    await tick();
    expect(s.submit(legalByCode(s, 'e7e5'))).toBe(true);
    await tick();
    expect(s.notations.value).toEqual(['e4', 'e5']);
    expect(s.sideToMove).toBe(0);
    s.undo();
    expect(s.codes()).toEqual(['e2e4']);
    expect(s.sideToMove).toBe(1);
    // The player whose turn it now is can move again after undo.
    expect(s.submit(legalByCode(s, 'c7c5'))).toBe(true);
    await tick();
    expect(s.notations.value).toEqual(['e4', 'c5']);
    s.dispose();
  });

  it('replays saved moves and stops accepting input when the game is over', async () => {
    // Fool's mate.
    const s = new GameSession(
      chess,
      { gameId: 'chess', mode: 'hotseat', humanSide: 0, level: 3 },
      chess.serialize(chess.initial()),
      ['f2f3', 'e7e5', 'g2g4'],
    );
    s.begin();
    expect(s.submit(legalByCode(s, 'd8h4'))).toBe(true);
    await tick();
    expect(s.status.value).toEqual({ kind: 'win', winner: 1, reason: 'checkmate' });
    expect(s.humanToMove).toBeNull();
    expect(s.notations.value[3]).toBe('Qh4#');
    s.dispose();
  });

  it('applies a checkers multi-jump as one move', async () => {
    const s = new GameSession(
      checkers,
      { gameId: 'checkers', mode: 'hotseat', humanSide: 0, level: 3 },
      'B:W14,23,30:B9',
    );
    s.begin();
    expect(s.submit(legalByCode(s, '9x18x27'))).toBe(true);
    await tick();
    expect(checkers.serialize(s.current.value)).toBe('W:W30:B27');
    s.dispose();
  });
});

describe('GameSession (vs AI) undo', () => {
  it('returns to the human turn and discards the pending AI request', async () => {
    const s = new GameSession(
      chess,
      { gameId: 'chess', mode: 'ai', humanSide: 0, level: 1 },
      chess.serialize(chess.initial()),
    );
    s.begin();
    expect(s.submit(legalByCode(s, 'e2e4'))).toBe(true);
    await tick();
    // No Worker in Node: the AI request fails or stays pending; either way undo must
    // bring the human back to move with an empty history.
    expect(s.canUndo).toBe(true);
    s.undo();
    expect(s.codes()).toEqual([]);
    expect(s.humanToMove).not.toBeNull();
    s.dispose();
  });

  it('cannot undo past the AI opening move when the human plays second', () => {
    const s = new GameSession(
      chess,
      { gameId: 'chess', mode: 'ai', humanSide: 1, level: 1 },
      chess.serialize(chess.initial()),
      ['e2e4'],
    );
    expect(s.canUndo).toBe(false);
    s.dispose();
  });
});
