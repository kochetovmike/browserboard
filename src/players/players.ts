import { AiClient } from '../ai/client';
import type { AiLevel, GameDefinition } from '../core/types';

export interface MoveRequest<P, M> {
  def: GameDefinition<P, M>;
  position: P;
  /** Serialized start position and move codes so far (what a worker/remote peer needs). */
  start: string;
  codes: string[];
}

/** Human, AI and (future) remote players are interchangeable behind this interface. */
export interface Player<P = unknown, M = unknown> {
  readonly kind: 'human' | 'ai';
  readonly label: string;
  requestMove(req: MoveRequest<P, M>, signal: AbortSignal): Promise<M>;
  dispose?(): void;
}

const abortError = () => new DOMException('Aborted', 'AbortError');

export class HumanPlayer<P, M> implements Player<P, M> {
  readonly kind = 'human';
  private resolver: ((m: M) => void) | null = null;
  constructor(readonly label: string) {}

  requestMove(_req: MoveRequest<P, M>, signal: AbortSignal): Promise<M> {
    return new Promise((resolve, reject) => {
      this.resolver = resolve;
      signal.addEventListener(
        'abort',
        () => {
          this.resolver = null;
          reject(abortError());
        },
        { once: true },
      );
    });
  }

  /** Called by the UI when the user enters a move. */
  provide(m: M): boolean {
    const r = this.resolver;
    if (!r) return false;
    this.resolver = null;
    r(m);
    return true;
  }
}

/** Short pause so instant replies at low levels still read as a "move". */
const MIN_THINK_MS = 350;

export class AiPlayer<P, M> implements Player<P, M> {
  readonly kind = 'ai';
  private client = new AiClient();
  constructor(
    readonly label: string,
    readonly level: AiLevel,
  ) {}

  async requestMove(req: MoveRequest<P, M>, signal: AbortSignal): Promise<M> {
    const t0 = performance.now();
    const code = await this.client.search(req.def.id, req.start, req.codes, this.level, signal);
    const wait = MIN_THINK_MS - (performance.now() - t0);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    if (signal.aborted) throw abortError();
    const m = code === null ? null : req.def.moveFromCode(req.position, code);
    if (m === null) throw new Error(`AI returned an illegal move: ${code}`);
    return m;
  }

  dispose(): void {
    this.client.reset();
  }
}
