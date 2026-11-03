import { batch, computed, type ReadonlySignal, signal } from '@preact/signals';
import { play, replay, statusOf } from '../core/rules';
import type { GameDefinition, GameStatus, Side } from '../core/types';
import { AiPlayer, HumanPlayer, type Player } from '../players/players';
import { type GameConfig, saveGame } from './storage';

/**
 * Drives one game: asks the side-to-move's Player for a move, applies it, records
 * history, persists, repeats. Player-type agnostic; a generation token guards against
 * late replies after undo / dispose.
 */
export class GameSession<P = unknown, M = unknown> {
  readonly positions = signal<P[]>([]);
  readonly moves = signal<M[]>([]);
  readonly notations = signal<string[]>([]);
  readonly thinking = signal(false);
  readonly error = signal<string | null>(null);
  readonly current: ReadonlySignal<P>;
  readonly status: ReadonlySignal<GameStatus>;
  readonly players: [Player<P, M>, Player<P, M>];

  private token = 0;
  private abort: AbortController | null = null;
  private disposed = false;

  constructor(
    readonly def: GameDefinition<P, M>,
    readonly config: GameConfig,
    readonly start: string,
    codes: string[] = [],
  ) {
    const { positions, moves } = replay(def, start, codes);
    this.positions.value = positions;
    this.moves.value = moves;
    this.notations.value = moves.map((m, i) => def.notation(positions[i], m));
    this.current = computed(() => this.positions.value[this.positions.value.length - 1]);
    this.status = computed(() => statusOf(def, this.current.value));
    this.players = [this.makePlayer(0), this.makePlayer(1)];
  }

  private makePlayer(side: Side): Player<P, M> {
    const { mode, humanSide, level } = this.config;
    if (mode === 'ai' && side !== humanSide) {
      const lvl = this.def.aiLevels.find((l) => l.level === level) ?? this.def.aiLevels[0];
      return new AiPlayer<P, M>(`Computer · ${lvl.name}`, lvl);
    }
    return new HumanPlayer<P, M>(mode === 'ai' ? 'You' : this.def.sideNames[side]);
  }

  get sideToMove(): Side {
    return this.def.engine.sideToMove(this.current.value);
  }

  /** Human player whose turn it is, or null when it is the AI's turn or the game is over. */
  get humanToMove(): HumanPlayer<P, M> | null {
    if (this.status.value.kind !== 'ongoing') return null;
    const p = this.players[this.sideToMove];
    return p instanceof HumanPlayer ? p : null;
  }

  begin(): void {
    this.persist();
    this.requestNext();
  }

  private requestNext(): void {
    this.abort?.abort();
    this.abort = null;
    if (this.disposed || this.status.value.kind !== 'ongoing') {
      this.thinking.value = false;
      return;
    }
    const player = this.players[this.sideToMove];
    const token = ++this.token;
    const ac = new AbortController();
    this.abort = ac;
    this.thinking.value = player.kind === 'ai';
    this.error.value = null;
    const req = {
      def: this.def,
      position: this.current.value,
      start: this.start,
      codes: this.codes(),
    };
    player
      .requestMove(req, ac.signal)
      .then((m) => {
        if (token !== this.token || this.disposed) return;
        this.apply(m);
      })
      .catch((e: unknown) => {
        if (token !== this.token || (e instanceof DOMException && e.name === 'AbortError')) return;
        this.thinking.value = false;
        this.error.value = e instanceof Error ? e.message : String(e);
      });
  }

  /** Entry point for UI input. Returns false if it is not a human's turn. */
  submit(m: M): boolean {
    return this.humanToMove?.provide(m) ?? false;
  }

  private apply(m: M): void {
    const before = this.current.value;
    const next = play(this.def, before, m);
    batch(() => {
      this.notations.value = [...this.notations.value, this.def.notation(before, m)];
      this.moves.value = [...this.moves.value, m];
      this.positions.value = [...this.positions.value, next];
      this.thinking.value = false;
    });
    this.persist();
    this.requestNext();
  }

  get canUndo(): boolean {
    const n = this.moves.value.length;
    if (this.config.mode === 'hotseat') return n > 0;
    // In AI mode, undo returns to a human turn; there is none before the AI's first move.
    return n > (this.config.humanSide === 0 ? 0 : 1);
  }

  /** Hot-seat: one ply. Vs AI: back to the human's previous turn. */
  undo(): void {
    if (!this.canUndo) return;
    this.abort?.abort();
    this.token++;
    let n = this.moves.value.length - 1;
    if (this.config.mode === 'ai') {
      const human = this.config.humanSide;
      while (n > 0 && this.def.engine.sideToMove(this.positions.value[n]) !== human) n--;
    }
    batch(() => {
      this.moves.value = this.moves.value.slice(0, n);
      this.notations.value = this.notations.value.slice(0, n);
      this.positions.value = this.positions.value.slice(0, n + 1);
      this.thinking.value = false;
    });
    this.persist();
    this.requestNext();
  }

  codes(): string[] {
    return this.moves.value.map((m) => this.def.moveToCode(m));
  }

  private persist(): void {
    saveGame({ config: this.config, start: this.start, moves: this.codes(), savedAt: Date.now() });
  }

  dispose(): void {
    this.disposed = true;
    this.token++;
    this.abort?.abort();
    for (const p of this.players) p.dispose?.();
  }
}
