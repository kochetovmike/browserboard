import { useState } from 'preact/hooks';
import type { GameDefinition, Side } from '../core/types';
import { GAMES } from '../games/registry';
import {
  loadPrefs,
  loadSavedGame,
  type Mode,
  type SetupPrefs,
  savePrefs,
} from '../session/storage';
import { checkersPiece, chessPiece } from './pieces';
import { navigate, playHash } from './router';

const ICONS: Record<string, () => preact.JSX.Element> = {
  chess: () => (
    <svg viewBox="-50 -50 100 100" aria-hidden="true">
      {chessPiece(0, 'knight')}
    </svg>
  ),
  checkers: () => (
    <svg viewBox="-50 -50 100 100" aria-hidden="true">
      {checkersPiece(0, 'king')}
    </svg>
  ),
};

function GameCard({ def }: { def: GameDefinition }) {
  const [prefs, setPrefs] = useState<SetupPrefs>(
    () => loadPrefs(def.id) ?? { mode: 'ai', level: 3, side: 0 },
  );
  const saved = loadSavedGame(def.id);
  const canResume = saved !== null && saved.moves.length > 0;

  const update = (patch: Partial<SetupPrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    savePrefs(def.id, next);
  };

  const start = () => {
    const side: Side = prefs.side === 'random' ? (Math.random() < 0.5 ? 0 : 1) : prefs.side;
    navigate(
      playHash({ gameId: def.id, mode: prefs.mode, level: prefs.level, side, resume: false }),
    );
  };

  const resume = () => {
    if (!saved) return;
    const c = saved.config;
    navigate(
      playHash({ gameId: def.id, mode: c.mode, level: c.level, side: c.humanSide, resume: true }),
    );
  };

  const id = (s: string) => `${def.id}-${s}`;

  return (
    <article class="card">
      <div class="card-head">
        <div class="card-icon">{ICONS[def.id]?.()}</div>
        <div>
          <h2>{def.name}</h2>
          <p class="muted">{def.tagline}</p>
        </div>
      </div>

      <fieldset class="segmented">
        <legend>Opponent</legend>
        {(['ai', 'hotseat'] as Mode[]).map((m) => (
          <label key={m}>
            <input
              type="radio"
              name={id('mode')}
              checked={prefs.mode === m}
              onChange={() => update({ mode: m })}
            />
            <span>{m === 'ai' ? 'Computer' : 'Two players'}</span>
          </label>
        ))}
      </fieldset>

      {prefs.mode === 'ai' && (
        <div class="row">
          <label for={id('level')}>
            Difficulty
            <select
              id={id('level')}
              value={prefs.level}
              onChange={(e) => update({ level: Number(e.currentTarget.value) })}
            >
              {def.aiLevels.map((l) => (
                <option key={l.level} value={l.level}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <label for={id('side')}>
            Play as
            <select
              id={id('side')}
              value={String(prefs.side)}
              onChange={(e) => {
                const v = e.currentTarget.value;
                update({ side: v === 'random' ? 'random' : (Number(v) as Side) });
              }}
            >
              <option value="0">{def.sideNames[0]} (moves first)</option>
              <option value="1">{def.sideNames[1]}</option>
              <option value="random">Random</option>
            </select>
          </label>
        </div>
      )}

      <div class="card-actions">
        <button type="button" class="primary" onClick={start}>
          New game
        </button>
        {canResume && (
          <button type="button" onClick={resume}>
            Continue ({saved.moves.length} moves)
          </button>
        )}
      </div>
    </article>
  );
}

export function Home() {
  return (
    <main class="home">
      <header class="hero">
        <h1>browserboard</h1>
        <p class="muted">
          Classic board games that run entirely in your browser. Play the computer or a friend on
          the same screen. No sign-up, no server.
        </p>
      </header>
      <div class="cards">
        {GAMES.map((g) => (
          <GameCard key={g.id} def={g} />
        ))}
      </div>
      <footer class="foot muted">Your games are saved in this browser only.</footer>
    </main>
  );
}
