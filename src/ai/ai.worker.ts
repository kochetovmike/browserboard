/// <reference lib="webworker" />
import { replay } from '../core/rules';
import { getGame } from '../games/registry';
import type { SearchRequest, WorkerResponse } from './protocol';
import { searchWithLevel } from './search';

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (ev: MessageEvent<SearchRequest>) => {
  const req = ev.data;
  let res: WorkerResponse;
  try {
    const def = getGame(req.gameId);
    if (!def) throw new Error(`Unknown game ${req.gameId}`);
    const { positions } = replay(def, req.start, req.moves);
    const pos = positions[positions.length - 1];
    const r = searchWithLevel(def.engine, pos, req.level);
    res = {
      type: 'result',
      id: req.id,
      move: r.move === null ? null : def.moveToCode(r.move),
      score: r.score,
      depth: r.depth,
      nodes: r.nodes,
    };
  } catch (e) {
    res = { type: 'error', id: req.id, message: e instanceof Error ? e.message : String(e) };
  }
  ctx.postMessage(res);
};
