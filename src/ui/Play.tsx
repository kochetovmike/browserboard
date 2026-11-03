import { useEffect, useMemo, useState } from 'preact/hooks';
import { type GameDefinition, type GameStatus, other, type Side } from '../core/types';
import { GameSession } from '../session/GameSession';
import { type GameConfig, loadSavedGame } from '../session/storage';
import { Board } from './Board';
import { PIECES } from './pieces';
import { navigate, type PlayRoute } from './router';

function createSession(def: GameDefinition, route: PlayRoute): GameSession {
  if (route.resume) {
    const saved = loadSavedGame(def.id);
    if (saved) {
      try {
        return new GameSession(def, saved.config, saved.start, saved.moves);
      } catch {
        /* corrupt or outdated save: fall through to a new game */
      }
    }
  }
  const config: GameConfig = {
    gameId: def.id,
    mode: route.mode,
    humanSide: route.side,
    level: route.level,
  };
  return new GameSession(def, config, def.serialize(def.initial()));
}

function statusText(def: GameDefinition, s: GameStatus, toMove: Side, thinking: boolean) {
  if (s.kind === 'win') return `${def.sideNames[s.winner]} wins — ${s.reason}`;
  if (s.kind === 'draw') return `Draw — ${s.reason}`;
  return `${def.sideNames[toMove]} to move${thinking ? ' · thinking…' : ''}`;
}

export function Play({ def, route }: { def: GameDefinition; route: PlayRoute }) {
  const [session, setSession] = useState(() => createSession(def, route));
  useEffect(() => {
    session.begin();
    return () => session.dispose();
  }, [session]);

  const cfg = session.config;
  const defaultFlip = cfg.mode === 'ai' ? cfg.humanSide !== def.board.bottomSide : false;
  const [flipped, setFlipped] = useState(defaultFlip);
  useEffect(() => setFlipped(defaultFlip), [defaultFlip]);

  // Reading .value subscribes this component to the signals.
  const position = session.current.value;
  const status = session.status.value;
  const thinking = session.thinking.value;
  const moves = session.moves.value;
  const notations = session.notations.value;
  const error = session.error.value;
  const toMove = def.engine.sideToMove(position);
  const humanTurn = session.humanToMove !== null;

  const legal = useMemo(
    () => (humanTurn ? def.engine.legalMoves(position) : []),
    [position, humanTurn, def],
  );

  const newGame = () => {
    session.dispose();
    setSession(
      createSession(def, {
        ...route,
        resume: false,
        mode: cfg.mode,
        side: cfg.humanSide,
        level: cfg.level,
      }),
    );
  };

  const rows: { n: number; a?: string; b?: string }[] = [];
  for (let i = 0; i < notations.length; i += 2) {
    rows.push({ n: i / 2 + 1, a: notations[i], b: notations[i + 1] });
  }

  const bottom: Side = flipped ? other(def.board.bottomSide) : def.board.bottomSide;
  const top = other(bottom);
  const playerTag = (side: Side) => (
    <div class={`player${toMove === side && status.kind === 'ongoing' ? ' active' : ''}`}>
      <span class={`swatch ${def.id}-${side}`} aria-hidden="true" />
      <span class="player-name">{session.players[side].label}</span>
      <span class="player-side">{def.sideNames[side]}</span>
    </div>
  );

  return (
    <main class="play">
      <header class="play-header">
        <button type="button" class="ghost" onClick={() => navigate('#/')}>
          ← Games
        </button>
        <h1>{def.name}</h1>
      </header>
      <div class="play-layout">
        <section class="board-col" aria-label="Board">
          {playerTag(top)}
          <Board
            def={def}
            position={position}
            legal={legal}
            lastMove={moves.length ? moves[moves.length - 1] : null}
            flipped={flipped}
            renderPiece={PIECES[def.id]}
            onMove={(m) => session.submit(m)}
          />
          {playerTag(bottom)}
        </section>
        <aside class="panel">
          <p class={`status ${status.kind}`} role="status" aria-live="polite">
            {statusText(def, status, toMove, thinking)}
          </p>
          {error && <p class="error">{error}</p>}
          <div class="actions">
            <button type="button" onClick={() => session.undo()} disabled={!session.canUndo}>
              Undo
            </button>
            <button type="button" onClick={() => setFlipped(!flipped)}>
              Flip board
            </button>
            <button type="button" class="primary" onClick={newGame}>
              New game
            </button>
          </div>
          <ol class="moves" aria-label="Move list">
            {rows.map((r) => (
              <li key={r.n}>
                <span class="num">{r.n}.</span>
                <span>{r.a}</span>
                <span>{r.b ?? ''}</span>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </main>
  );
}
