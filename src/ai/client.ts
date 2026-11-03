import type { AiLevel } from '../core/types';
import type { SearchRequest, WorkerResponse } from './protocol';

/**
 * Main-thread handle to the AI worker. The worker is created lazily and terminated
 * on abort, so a stale search can never deliver a move after undo / new game.
 */
export class AiClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (code: string | null) => void; reject: (e: Error) => void }
  >();

  private ensure(): Worker {
    if (this.worker) return this.worker;
    const w = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const msg = ev.data;
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.type === 'result') p.resolve(msg.move);
      else p.reject(new Error(msg.message));
    };
    w.onerror = (ev) => {
      for (const p of this.pending.values()) p.reject(new Error(ev.message || 'AI worker error'));
      this.pending.clear();
      this.reset();
    };
    this.worker = w;
    return w;
  }

  search(
    gameId: string,
    start: string,
    moves: string[],
    level: AiLevel,
    signal: AbortSignal,
  ): Promise<string | null> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      signal.addEventListener(
        'abort',
        () => {
          if (!this.pending.has(id)) return;
          this.pending.delete(id);
          // A synchronous search can't be interrupted from outside: kill the worker.
          this.reset();
          reject(new DOMException('Aborted', 'AbortError'));
        },
        { once: true },
      );
      const req: SearchRequest = { type: 'search', id, gameId, start, moves, level };
      this.ensure().postMessage(req);
    });
  }

  reset(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}
