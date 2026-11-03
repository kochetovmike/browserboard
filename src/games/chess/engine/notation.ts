import {
  BISHOP,
  BLACK,
  CASTLE_BK,
  CASTLE_BQ,
  CASTLE_WK,
  CASTLE_WQ,
  type ChessMove,
  type ChessPosition,
  colorOf,
  computeHash,
  emptyPosition,
  F_CAPTURE,
  F_CASTLE,
  fileOf,
  inCheck,
  KING,
  KNIGHT,
  legalMoves,
  makeMove,
  makePiece,
  mFlags,
  mFrom,
  mPromo,
  mTo,
  PAWN,
  QUEEN,
  ROOK,
  rankOf,
  typeOf,
  unmakeMove,
  WHITE,
} from './position';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const LETTERS = ' pnbrqk';

export const squareName = (sq: number) => 'abcdefgh'[fileOf(sq)] + String(rankOf(sq) + 1);
export function parseSquare(s: string): number {
  const f = s.charCodeAt(0) - 97;
  const r = s.charCodeAt(1) - 49;
  if (f < 0 || f > 7 || r < 0 || r > 7) return -1;
  return r * 16 + f;
}

export function fromFen(fen: string): ChessPosition {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 4) throw new Error(`Bad FEN: ${fen}`);
  const p = emptyPosition();
  const rows = parts[0].split('/');
  if (rows.length !== 8) throw new Error(`Bad FEN board: ${fen}`);
  for (let i = 0; i < 8; i++) {
    const rank = 7 - i;
    let file = 0;
    for (const ch of rows[i]) {
      if (ch >= '1' && ch <= '8') {
        file += Number(ch);
        continue;
      }
      const t = LETTERS.indexOf(ch.toLowerCase());
      if (t <= 0 || file > 7) throw new Error(`Bad FEN piece "${ch}": ${fen}`);
      const colour = ch === ch.toUpperCase() ? WHITE : BLACK;
      const sq = rank * 16 + file;
      p.board[sq] = makePiece(t, colour);
      if (t === KING) p.kings[colour] = sq;
      file++;
    }
  }
  if (p.kings[0] < 0 || p.kings[1] < 0) throw new Error(`FEN needs both kings: ${fen}`);
  p.side = parts[1] === 'b' ? 1 : 0;
  p.castling =
    (parts[2].includes('K') ? CASTLE_WK : 0) |
    (parts[2].includes('Q') ? CASTLE_WQ : 0) |
    (parts[2].includes('k') ? CASTLE_BK : 0) |
    (parts[2].includes('q') ? CASTLE_BQ : 0);
  p.ep = parts[3] === '-' ? -1 : parseSquare(parts[3]);
  p.halfmove = Number(parts[4] ?? 0) || 0;
  p.fullmove = Number(parts[5] ?? 1) || 1;
  computeHash(p);
  return p;
}

export function toFen(p: ChessPosition): string {
  const rows: string[] = [];
  for (let rank = 7; rank >= 0; rank--) {
    let row = '';
    let empty = 0;
    for (let file = 0; file < 8; file++) {
      const pc = p.board[rank * 16 + file];
      if (!pc) {
        empty++;
        continue;
      }
      if (empty) row += String(empty);
      empty = 0;
      const ch = LETTERS[typeOf(pc)];
      row += colorOf(pc) === WHITE ? ch.toUpperCase() : ch;
    }
    if (empty) row += String(empty);
    rows.push(row);
  }
  const c =
    (p.castling & CASTLE_WK ? 'K' : '') +
      (p.castling & CASTLE_WQ ? 'Q' : '') +
      (p.castling & CASTLE_BK ? 'k' : '') +
      (p.castling & CASTLE_BQ ? 'q' : '') || '-';
  const ep = p.ep >= 0 ? squareName(p.ep) : '-';
  return `${rows.join('/')} ${p.side === 0 ? 'w' : 'b'} ${c} ${ep} ${p.halfmove} ${p.fullmove}`;
}

export function toUci(m: ChessMove): string {
  const pr = mPromo(m);
  return squareName(mFrom(m)) + squareName(mTo(m)) + (pr ? LETTERS[pr] : '');
}

export function fromUci(p: ChessPosition, uci: string): ChessMove | null {
  const s = uci.trim().toLowerCase();
  const from = parseSquare(s.slice(0, 2));
  const to = parseSquare(s.slice(2, 4));
  const pr = s.length > 4 ? LETTERS.indexOf(s[4]) : 0;
  return legalMoves(p).find((m) => mFrom(m) === from && mTo(m) === to && mPromo(m) === pr) ?? null;
}

/** Standard Algebraic Notation for `m` in position `p` (position before the move). */
export function toSan(p: ChessPosition, m: ChessMove, legal = legalMoves(p)): string {
  const from = mFrom(m);
  const to = mTo(m);
  const flags = mFlags(m);
  const pc = p.board[from];
  const t = typeOf(pc);
  let san: string;
  if (flags & F_CASTLE) {
    san = to > from ? 'O-O' : 'O-O-O';
  } else if (t === PAWN) {
    san = flags & F_CAPTURE ? `${'abcdefgh'[fileOf(from)]}x${squareName(to)}` : squareName(to);
    const pr = mPromo(m);
    if (pr) san += `=${LETTERS[pr].toUpperCase()}`;
  } else {
    let dis = '';
    const rivals = legal.filter(
      (o) => o !== m && mTo(o) === to && p.board[mFrom(o)] === pc && mFrom(o) !== from,
    );
    if (rivals.length > 0) {
      const sameFile = rivals.some((o) => fileOf(mFrom(o)) === fileOf(from));
      const sameRank = rivals.some((o) => rankOf(mFrom(o)) === rankOf(from));
      if (!sameFile) dis = 'abcdefgh'[fileOf(from)];
      else if (!sameRank) dis = String(rankOf(from) + 1);
      else dis = squareName(from);
    }
    san = LETTERS[t].toUpperCase() + dis + (flags & F_CAPTURE ? 'x' : '') + squareName(to);
  }
  makeMove(p, m);
  if (inCheck(p)) san += legalMoves(p).length === 0 ? '#' : '+';
  unmakeMove(p, m);
  return san;
}

export function fromSan(p: ChessPosition, san: string): ChessMove | null {
  const clean = (s: string) => s.replace(/[+#!?]/g, '').replace(/0/g, 'O');
  const want = clean(san.trim());
  const legal = legalMoves(p);
  return legal.find((m) => clean(toSan(p, m, legal)) === want) ?? null;
}

export const PROMO_NAMES: Record<number, string> = {
  [QUEEN]: 'Queen',
  [ROOK]: 'Rook',
  [BISHOP]: 'Bishop',
  [KNIGHT]: 'Knight',
};
