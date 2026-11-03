import { signal } from '@preact/signals';
import type { Side } from '../core/types';
import type { Mode } from '../session/storage';

/**
 * Hash routing only: GitHub Pages has no SPA fallback, and hash URLs work under
 * /browserboard/ and on a custom domain alike.
 *   #/                                       game picker
 *   #/play/<gameId>?mode=ai&level=3&side=0   new game
 *   #/play/<gameId>?resume=1                 continue saved game
 */
export type Route = { name: 'home' } | PlayRoute;

export interface PlayRoute {
  name: 'play';
  gameId: string;
  mode: Mode;
  level: number;
  side: Side;
  resume: boolean;
}

export function parseHash(hash: string): Route {
  const h = hash.replace(/^#/, '');
  const [path, query = ''] = h.split('?');
  const m = /^\/play\/([a-z0-9-]+)$/.exec(path);
  if (!m) return { name: 'home' };
  const q = new URLSearchParams(query);
  const level = Number(q.get('level'));
  return {
    name: 'play',
    gameId: m[1],
    mode: q.get('mode') === 'hotseat' ? 'hotseat' : 'ai',
    level: level >= 1 && level <= 5 ? level : 3,
    side: q.get('side') === '1' ? 1 : 0,
    resume: q.get('resume') === '1',
  };
}

export function playHash(r: Omit<PlayRoute, 'name'>): string {
  const q = new URLSearchParams({ mode: r.mode, level: String(r.level), side: String(r.side) });
  if (r.resume) q.set('resume', '1');
  return `#/play/${r.gameId}?${q}`;
}

export const route = signal<Route>(parseHash(location.hash));
window.addEventListener('hashchange', () => {
  route.value = parseHash(location.hash);
});

export function navigate(hash: string): void {
  if (location.hash === hash) route.value = parseHash(hash);
  else location.hash = hash;
}
