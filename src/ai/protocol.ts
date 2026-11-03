import type { AiLevel } from '../core/types';

/** Messages crossing the worker boundary. Only structured-clone-safe plain data. */
export interface SearchRequest {
  type: 'search';
  id: number;
  gameId: string;
  /** Serialized start position plus move codes, so the worker sees full repetition history. */
  start: string;
  moves: string[];
  level: AiLevel;
}

export type WorkerResponse =
  | { type: 'result'; id: number; move: string | null; score: number; depth: number; nodes: number }
  | { type: 'error'; id: number; message: string };
