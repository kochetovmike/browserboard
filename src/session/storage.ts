import type { Side } from '../core/types';

/**
 * localStorage persistence. All Pages project sites of one GitHub user share an origin,
 * so every key is namespaced and versioned. Storage may be unavailable (private mode,
 * blocked site data): every access is wrapped and failures are silent.
 */
const PREFIX = 'browserboard:v1:';

export type Mode = 'hotseat' | 'ai';

export interface GameConfig {
  gameId: string;
  mode: Mode;
  /** Side controlled by the human in AI mode. */
  humanSide: Side;
  level: number;
}

export interface SavedGame {
  config: GameConfig;
  start: string;
  moves: string[];
  savedAt: number;
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* storage unavailable */
  }
}

export const loadSavedGame = (gameId: string) => read<SavedGame>(`game:${gameId}`);
export const saveGame = (g: SavedGame) => write(`game:${g.config.gameId}`, g);
export const clearSavedGame = (gameId: string) => remove(`game:${gameId}`);

export interface SetupPrefs {
  mode: Mode;
  level: number;
  side: Side | 'random';
}
export const loadPrefs = (gameId: string) => read<SetupPrefs>(`prefs:${gameId}`);
export const savePrefs = (gameId: string, p: SetupPrefs) => write(`prefs:${gameId}`, p);
