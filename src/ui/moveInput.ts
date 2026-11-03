/**
 * Pure click-to-move resolution used by the generic Board (DOM-free, unit-tested).
 *
 * Every legal move has a click path [from, ...hops, to]. The user builds a prefix of
 * that path one click at a time; clicking a later square of a path skips ahead.
 */
export interface MovePath<M> {
  m: M;
  path: number[];
}

export type ClickResult<M> =
  | { kind: 'select'; prefix: number[] }
  | { kind: 'move'; move: M }
  | { kind: 'choose'; moves: M[] }
  | { kind: 'none' };

export const startsWith = (path: number[], prefix: number[]) =>
  prefix.length <= path.length && prefix.every((sq, i) => path[i] === sq);

export function candidatesFor<M>(paths: MovePath<M>[], prefix: number[]): MovePath<M>[] {
  return prefix.length ? paths.filter((x) => startsWith(x.path, prefix)) : [];
}

export function resolveClick<M>(
  paths: MovePath<M>[],
  prefix: number[],
  sq: number,
): ClickResult<M> {
  if (sq < 0) return { kind: 'none' };
  // Mid-jump the piece is drawn on the last hop; clicking it again does nothing.
  if (prefix.length > 1 && sq === prefix[prefix.length - 1]) return { kind: 'none' };

  const through: { c: MovePath<M>; idx: number }[] = [];
  for (const c of candidatesFor(paths, prefix)) {
    const idx = c.path.indexOf(sq, prefix.length);
    if (idx >= 0) through.push({ c, idx });
  }

  if (through.length > 0) {
    const ending = through.filter((t) => t.idx === t.c.path.length - 1);
    const continuing = through.filter((t) => t.idx < t.c.path.length - 1);
    if (continuing.length === 0) {
      return ending.length === 1
        ? { kind: 'move', move: ending[0].c.m }
        : { kind: 'choose', moves: ending.map((t) => t.c.m) };
    }
    const routes = new Set(continuing.map((t) => t.c.path.slice(0, t.idx + 1).join(',')));
    if (ending.length === 0 && routes.size === 1) {
      const t = continuing[0];
      return { kind: 'select', prefix: t.c.path.slice(0, t.idx + 1) };
    }
    // The square ends some routes and continues others, or is reached by several
    // different routes: let the user pick the full move explicitly.
    return { kind: 'choose', moves: through.map((t) => t.c.m) };
  }

  const movable = paths.some((x) => x.path[0] === sq);
  if (movable && !(prefix.length === 1 && prefix[0] === sq))
    return { kind: 'select', prefix: [sq] };
  return { kind: 'select', prefix: [] };
}
