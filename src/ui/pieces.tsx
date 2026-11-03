import type { JSX } from 'preact';
import type { Side } from '../core/types';

/** Piece artwork per game. Drawn in a 100×100 box centred on (0,0). */
export type PieceRenderer = (side: Side, kind: string) => JSX.Element;

// U+FE0E forces text (not emoji) presentation, notably for the black pawn.
const VS = '︎';
const SOLID: Record<string, string> = {
  king: '♚',
  queen: '♛',
  rook: '♜',
  bishop: '♝',
  knight: '♞',
  pawn: '♟',
};
const OUTLINE: Record<string, string> = {
  king: '♔',
  queen: '♕',
  rook: '♖',
  bishop: '♗',
  knight: '♘',
  pawn: '♙',
};

const glyph = (text: string, cls: string) => (
  <text class={cls} x="0" y="4" text-anchor="middle" dominant-baseline="central" font-size="78">
    {text + VS}
  </text>
);

export const chessPiece: PieceRenderer = (side, kind) =>
  side === 0 ? (
    <g class="chess-piece white">
      {glyph(SOLID[kind], 'fill')}
      {glyph(OUTLINE[kind], 'ink')}
    </g>
  ) : (
    <g class="chess-piece black">{glyph(SOLID[kind], 'fill')}</g>
  );

export const checkersPiece: PieceRenderer = (side, kind) => (
  <g class={`checker ${side === 0 ? 'black' : 'white'}`}>
    <circle class="rim" r="38" cy="3" />
    <circle class="body" r="38" />
    <circle class="ring" r="27" />
    {kind === 'king' && (
      <path class="crown" d="M-17 9 L-19 -9 L-9 -1 L0 -15 L9 -1 L19 -9 L17 9 Z" />
    )}
  </g>
);

export const PIECES: Record<string, PieceRenderer> = {
  chess: chessPiece,
  checkers: checkersPiece,
};
