import type { GameDefinition } from '../core/types';
import { checkers } from './checkers';
import { chess } from './chess';

/** All playable games. Adding a game = new folder under src/games + one entry here. */
// biome-ignore lint/suspicious/noExplicitAny: heterogeneous registry; each entry is internally typed.
export const GAMES: GameDefinition<any, any>[] = [checkers, chess];

// biome-ignore lint/suspicious/noExplicitAny: see above
export function getGame(id: string): GameDefinition<any, any> | undefined {
  return GAMES.find((g) => g.id === id);
}
