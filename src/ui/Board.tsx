import { useEffect, useMemo, useState } from 'preact/hooks';
import type { GameDefinition } from '../core/types';
import type { PieceRenderer } from './pieces';

interface BoardProps<P, M> {
  def: GameDefinition<P, M>;
  position: P;
  /** Legal moves the user may enter right now (empty when input is disabled). */
  legal: M[];
  lastMove: M | null;
  flipped: boolean;
  renderPiece: PieceRenderer;
  onMove(m: M): void;
}

const S = 100; // square size in SVG units

const startsWith = (path: number[], prefix: number[]) => prefix.every((sq, i) => path[i] === sq);

/**
 * Game-agnostic SVG board. Input is click-to-move along each move's "click path"
 * ([from, ...hops, to]); a chooser resolves moves sharing a path (e.g. promotion).
 */
export function Board<P, M>(props: BoardProps<P, M>) {
  const { def, position, legal, lastMove, flipped, renderPiece, onMove } = props;
  const g = def.board;
  const [prefix, setPrefix] = useState<number[]>([]);
  const [choice, setChoice] = useState<M[] | null>(null);

  // Reset selection whenever the position or the set of legal moves changes.
  useEffect(() => {
    setPrefix([]);
    setChoice(null);
  }, [position, legal]);

  const paths = useMemo(() => legal.map((m) => ({ m, path: g.movePath(m) })), [legal, g]);
  const candidates = prefix.length ? paths.filter((x) => startsWith(x.path, prefix)) : [];
  const targets = new Set<number>();
  for (const c of candidates) for (const sq of c.path.slice(prefix.length)) targets.add(sq);
  const finals = new Set(candidates.map((c) => c.path[c.path.length - 1]));
  const movable = new Set(paths.map((x) => x.path[0]));

  const toView = (row: number, col: number) =>
    flipped ? { row: g.rows - 1 - row, col: g.cols - 1 - col } : { row, col };

  const click = (sq: number) => {
    if (sq < 0 || choice) return;
    if (prefix.length && targets.has(sq)) {
      const ending = candidates.filter((c) => c.path[c.path.length - 1] === sq);
      if (ending.length === 1) {
        setPrefix([]);
        onMove(ending[0].m);
        return;
      }
      if (ending.length > 1) {
        setChoice(ending.map((c) => c.m));
        return;
      }
      // Intermediate hop of a multi-jump: extend the prefix along a matching path.
      const via = candidates.find((c) => c.path.indexOf(sq, prefix.length) >= 0);
      if (via) setPrefix(via.path.slice(0, via.path.indexOf(sq, prefix.length) + 1));
      return;
    }
    if (movable.has(sq) && !(prefix.length === 1 && prefix[0] === sq)) setPrefix([sq]);
    else setPrefix([]);
  };

  const lastSquares = new Set(lastMove !== null ? g.highlightSquares(lastMove) : []);
  const alert = g.alertSquare(position);
  const pieces = g.pieces(position);
  const pieceAt = new Map(pieces.map((p) => [p.sq, p]));

  const squares = [];
  for (let row = 0; row < g.rows; row++) {
    for (let col = 0; col < g.cols; col++) {
      const sq = g.squareAt(row, col);
      const v = toView(row, col);
      const x = v.col * S;
      const y = v.row * S;
      const dark = g.isDark(row, col);
      const piece = sq >= 0 ? pieceAt.get(sq) : undefined;
      const selected = prefix.includes(sq);
      const isTarget = targets.has(sq);
      const interactive = sq >= 0 && (movable.has(sq) || isTarget);
      const label =
        sq >= 0
          ? `${g.squareName(sq)}${piece ? `, ${def.sideNames[piece.side]} ${piece.kind}` : ''}`
          : undefined;
      const caption = sq >= 0 ? g.squareCaption?.(sq) : null;
      squares.push(
        // Interactive squares get role="button" + tabIndex + key handling; clicks on the
        // others only clear the selection, so they need no role.
        // biome-ignore lint/a11y/noStaticElementInteractions: role is set when interactive
        <g
          key={`${row}-${col}`}
          class={`sq${interactive ? ' interactive' : ''}`}
          transform={`translate(${x} ${y})`}
          onClick={() => click(sq)}
          role={interactive ? 'button' : undefined}
          tabIndex={interactive ? 0 : undefined}
          aria-label={interactive ? label : undefined}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              click(sq);
            }
          }}
        >
          <rect class={dark ? 'dark' : 'light'} width={S} height={S} />
          {lastSquares.has(sq) && <rect class="hl-last" width={S} height={S} />}
          {selected && <rect class="hl-selected" width={S} height={S} />}
          {sq >= 0 && sq === alert && <rect class="hl-alert" width={S} height={S} />}
          {caption && (
            <text class="caption" x="6" y="18">
              {caption}
            </text>
          )}
          {piece && (
            <g transform={`translate(${S / 2} ${S / 2})`}>{renderPiece(piece.side, piece.kind)}</g>
          )}
          {isTarget &&
            (piece || !finals.has(sq) ? (
              <circle class="hl-target ring" cx={S / 2} cy={S / 2} r={piece ? 44 : 14} />
            ) : (
              <circle class="hl-target" cx={S / 2} cy={S / 2} r={16} />
            ))}
        </g>,
      );
    }
  }

  // Coordinates are laid out in view space (bottom row / left column as displayed);
  // toView is its own inverse, so it also maps a view cell back to the model cell.
  const labels = [];
  if (g.fileLabels && g.rankLabels) {
    for (let vc = 0; vc < g.cols; vc++) {
      const m = toView(g.rows - 1, vc);
      labels.push(
        <text
          key={`f${vc}`}
          class={`coord ${g.isDark(m.row, m.col) ? 'on-dark' : 'on-light'}`}
          x={vc * S + S - 6}
          y={g.rows * S - 6}
          text-anchor="end"
        >
          {g.fileLabels[m.col]}
        </text>,
      );
    }
    for (let vr = 0; vr < g.rows; vr++) {
      const m = toView(vr, 0);
      labels.push(
        <text
          key={`r${vr}`}
          class={`coord ${g.isDark(m.row, m.col) ? 'on-dark' : 'on-light'}`}
          x={6}
          y={vr * S + 20}
        >
          {g.rankLabels[m.row]}
        </text>,
      );
    }
  }

  return (
    <div class="board-wrap">
      <svg class={`board board-${def.id}`} viewBox={`0 0 ${g.cols * S} ${g.rows * S}`}>
        <title>{`${def.name} board`}</title>
        {squares}
        <g class="coords">{labels}</g>
      </svg>
      {choice && (
        <div class="chooser" role="dialog" aria-label="Choose move">
          <div class="chooser-card">
            <p>Choose</p>
            <div class="chooser-options">
              {choice.map((m) => (
                <button
                  type="button"
                  key={def.moveToCode(m)}
                  onClick={() => {
                    setChoice(null);
                    setPrefix([]);
                    onMove(m);
                  }}
                >
                  {def.choiceLabel(m)}
                </button>
              ))}
            </div>
            <button type="button" class="ghost" onClick={() => setChoice(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
