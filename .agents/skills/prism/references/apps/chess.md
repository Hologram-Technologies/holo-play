# Reference app: chess

Written by scripts/design-reference.mjs from examples/design/ in the PrismPM repository. Imitate its structure; take the model's protocol from your own model.

Starboard is chess by the full rules, in the Deep Space theme. The model in `app/src/App.lex.tex` decides every rule: legal moves, check, checkmate, stalemate, castling, en passant and promotion. Lean's kernel proves its 26 theorems, and the build replays its 40 acceptance vectors. The page in `app/view/` is built only from the catalogue. It holds the position the model last answered, sends it back with a square or a move, and draws the answer. The page is authored, not proved.

This folder holds only what differs from `prism-code init`. To rebuild it from nothing:

```bash
node examples/design/build.mjs chess <out-dir>
```

That runs `init`, lays these files over the result, then runs `lock`, `check`, `build` and `verify`.

## app/DESIGN.md

```markdown
# Design: Starboard, in Deep Space

This file describes the look of the app in words. Its tokens are in `design/theme.json`. Re-read this before changing the page.

- **Product.** Starboard. The toolbar holds the wordmark: a crown icon on the accent, then the name in the display face.
- **Theme.** Deep Space, written by hand rather than from the `midnight` preset. Midnight's navy, gold and serif read as a club room. The brief asked for a sci-fi look, and the cool navy with one cyan accent does that better.
- **Ground.** Dark only. The ground is deep navy (`#050a17`); cards and the toolbar sit on slightly lifted navy. There is no light mode. In immersive mode the navy surfaces stay and the frame's photo shows through.
- **One accent.** Cyan (`#3ddcff`), as both `primary` and `brand`. It marks the wordmark, the one default button, focus, the selected square and the last move, and nothing else. Status colour is semantic: green for "to move" and play, red for check and mate, amber for stalemate.
- **Pieces.** These are the catalogue's paper and ink (`data-piece`), each outlined in the other, so they read the same in every theme.
- **Type.** The display face is squared and technical: Orbitron where installed, then Bahnschrift, Eurostile, DIN Alternate, Segoe UI. It is used for the wordmark and the large status line ("White to move"), with a small uppercase eyebrow above that line. Body text keeps the brand's sans.
- **Icons.** There are four, each with a job:
  - crown, the mark;
  - undo-2, Undo;
  - rotate-ccw, New game;
  - trophy, the result.
- **Shape and rhythm.** Radii are tighter than the brand's (0.25 to 0.75 rem). Spacing is generous (gaps of 1.5 to 2 rem). The board is the largest thing on every screen. Its coordinates sit beside it on the ground, not inside the squares, where they could not reach 4.5:1.
- **Restraint.** No glow, no gradients and no colour outside the theme's roles. Every pair of text and surface passes 4.5:1.
```

## app/design/theme.json

```json
{
  "schema": "prism/theme/1",
  "name": "Deep Space",
  "modes": [
    "dark"
  ],
  "dark": {
    "background": "#050a17",
    "foreground": "#e4eeff",
    "card": "#0b1428",
    "card-foreground": "#e4eeff",
    "popover": "#0d182f",
    "popover-foreground": "#e4eeff",
    "primary": "#3ddcff",
    "primary-foreground": "#03111d",
    "secondary": "#121f3a",
    "secondary-foreground": "#dbe7ff",
    "muted": "#101b33",
    "muted-foreground": "#94a8c9",
    "accent": "#15264a",
    "accent-foreground": "#e4eeff",
    "brand": "#3ddcff",
    "brand-foreground": "#03111d",
    "destructive": "#ff6b7d",
    "destructive-foreground": "#1d0207",
    "success": "#4fe0a5",
    "success-foreground": "#03150d",
    "warning": "#ffb547",
    "warning-foreground": "#1d1200",
    "info": "#7cc8ff",
    "link": "#3ddcff",
    "link-hover": "#8fecff",
    "muted-foreground-subtle": "#6f83a6",
    "border": "#1f2d4d",
    "input": "#2a3b61",
    "ring": "#3ddcff",
    "chart-1": "#3ddcff",
    "chart-2": "#ffb547",
    "chart-3": "#9d8cff",
    "chart-4": "#4fe0a5",
    "chart-5": "#5d6f92",
    "sidebar": "#081123",
    "sidebar-foreground": "#e4eeff",
    "sidebar-primary": "#3ddcff",
    "sidebar-primary-foreground": "#03111d",
    "sidebar-accent": "#15264a",
    "sidebar-accent-foreground": "#e4eeff",
    "sidebar-border": "#1f2d4d",
    "sidebar-ring": "#3ddcff",
    "destructive-subtle": "#2a0f1a",
    "destructive-border": "#6e2638",
    "warning-subtle": "#2a1d08",
    "warning-border": "#6e4c17",
    "success-subtle": "#0a2a20",
    "success-border": "#1d5e45",
    "info-subtle": "#0d2340",
    "info-border": "#21497a",
    "primary-hover": "#7be8ff",
    "accent-pressed": "#1b2f5a",
    "border-solid": "#1f2d4d",
    "border-strong": "#2e4371",
    "scrim": "#01030acc",
    "shadow": "#0000008c"
  },
  "radius": {
    "sm": "0.25rem",
    "md": "0.375rem",
    "lg": "0.5rem",
    "xl": "0.75rem"
  },
  "font": {
    "display": "Orbitron, Bahnschrift, Eurostile, 'DIN Alternate', 'Segoe UI', sans-serif",
    "mono": "'JetBrains Mono', 'Cascadia Mono', Consolas, monospace"
  }
}
```

## app/view/app.js

```js
// The chess page. It holds no rule: it keeps the position the model last answered, sends it back with a square or a
// move, and draws the answer. The model (app/src/App.lex.tex) decides every legal move, check, mate, castling,
// en passant and promotion. prism.js gives globalThis.prism and prism-ui.js gives globalThis.ui; no file imports another.
//
// The protocol, all plain text:
//   new                      -> <position> play .
//   <position> e2            -> moves e2e4 e2e3          (the legal moves from a square; e7e8q e7e8r ... for a promotion)
//   <position> e2e4 | e7e8q  -> <position> <status> <taken>   or   illegal move | leaves king in check | invalid request
// A position is the board rank 8 first, the side to move, the castling rights and the en passant file:
//   rnbqkbnr/pppppppp/......../......../......../......../PPPPPPPP/RNBQKBNR w KQkq -
const { invoke } = globalThis.prism;
// ui.toast is called by that name: the build ships the toast part only when the page's text says ui.toast(.
const ui = globalThis.ui;
const { h } = ui;

const $ = (id) => document.getElementById(id);
const boardEl = $('board');
const FILES = 'abcdefgh';
const NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
// Filled glyphs for both sides, drawn as text (U+FE0E) so no platform turns a pawn into an emoji.
const GLYPH = { p: '\u265F', n: '\u265E', b: '\u265D', r: '\u265C', q: '\u265B', k: '\u265A' };
const glyph = (letter) => `${GLYPH[letter.toLowerCase()]}\uFE0E`;
const sideOf = (letter) => (letter === letter.toUpperCase() ? 'white' : 'black');
const STATUS = {
  play: { badge: 'In play', variant: 'secondary' },
  check: { badge: 'Check', variant: 'destructive' },
  mate: { badge: 'Checkmate', variant: 'destructive' },
  stalemate: { badge: 'Stalemate', variant: 'outline' },
};
const REFUSALS = {
  'illegal move': ['The model refused the move', 'That piece cannot move there under the rules of chess.'],
  'leaves king in check': ['Your king would be in check', 'That move would leave your own king attacked, so the model refused it.'],
  'invalid request': ['The model could not read the request', 'The page sent something that is not a position and a move.'],
};

// What the page holds: the model's last answer and everything drawn from the answers before it.
let game = null; // { position, status, last: [from, to] | null, moves: [text], taken: { white: [], black: [] } }
const history = []; // earlier games, for undo
let selected = null; // a square, like 'e2'
let offers = []; // the moves the model listed for the selected square, like ['e2e4', 'e2e3']
let busy = false;

const squareName = (row, col) => `${FILES[col]}${8 - row}`;
const boardOf = (position) => position.split(' ')[0].split('/').map((row) => [...row]);
const turnOf = (position) => (position.split(' ')[1] === 'w' ? 'white' : 'black');
const pieceOn = (position, square) => boardOf(position)[8 - Number(square[1])][FILES.indexOf(square[0])];

// ---- Drawing

const cells = [];
for (let row = 0; row < 8; row++) {
  for (let col = 0; col < 8; col++) {
    const name = squareName(row, col);
    const cell = h('button', { slot: 'board-cell', type: 'button', 'data-square': name, 'aria-label': `${name}, empty` });
    cell.addEventListener('click', () => choose(name));
    cells.push(cell);
  }
}
boardEl.append(...cells);
boardEl.addEventListener('keydown', (event) => { if (event.key === 'Escape') { letGo(); draw(); } });

function draw() {
  const board = boardOf(game.position);
  const turn = turnOf(game.position);
  const targets = new Set(offers.map((m) => m.slice(2, 4)));
  const danger = game.status === 'check' || game.status === 'mate' ? (turn === 'white' ? 'K' : 'k') : null;
  cells.forEach((cell, i) => {
    const row = Math.floor(i / 8);
    const col = i % 8;
    const name = squareName(row, col);
    const letter = board[row][col];
    const words = [name];
    cell.replaceChildren();
    if (letter !== '.') {
      cell.dataset.piece = sideOf(letter);
      cell.append(glyph(letter));
      words.push(`${sideOf(letter)} ${NAMES[letter.toLowerCase()]}`);
    } else {
      delete cell.dataset.piece;
      words.push('empty');
    }
    cell.toggleAttribute('data-selected', name === selected);
    cell.toggleAttribute('data-target', targets.has(name));
    cell.toggleAttribute('data-last', Boolean(game.last && game.last.includes(name)));
    cell.toggleAttribute('data-danger', letter === danger);
    if (name === selected) words.push('selected');
    if (targets.has(name)) words.push('a legal move');
    if (letter === danger) words.push(game.status === 'mate' ? 'checkmated' : 'in check');
    cell.setAttribute('aria-label', words.join(', '));
  });

  const status = STATUS[game.status];
  const badge = $('status-badge');
  badge.textContent = status.badge;
  badge.dataset.variant = status.variant;
  const over = game.status === 'mate' || game.status === 'stalemate';
  const side = turn === 'white' ? 'White' : 'Black';
  const other = turn === 'white' ? 'Black' : 'White';
  $('status-line').textContent = over ? (game.status === 'mate' ? `${other} wins` : 'Draw') : `${side} to move${game.status === 'check' ? ', in check' : ''}`;
  $('hint').textContent = over ? 'The game is over. Start a new one, or take back a move.' : selected ? `${selected} is chosen: pick a marked square, or another piece.` : 'Choose a piece to see where it can go.';
  $('eyebrow').textContent = over ? `Game over after ${game.moves.length} moves` : `Move ${Math.floor(game.moves.length / 2) + 1}`;
  $('outcome').hidden = !over;
  alerts();
  if (over) {
    $('outcome-title').textContent = game.status === 'mate' ? `Checkmate. ${other} wins.` : 'Stalemate. The game is drawn.';
    $('outcome-text').textContent = game.status === 'mate' ? `${side}'s king is in check and has no legal move.` : `${side} is not in check and has no legal move.`;
  }
  for (const who of ['white', 'black']) {
    const mark = $(`${who}-turn`);
    mark.hidden = over || turn !== who;
    mark.textContent = game.status === 'check' ? 'In check' : 'To move';
    mark.dataset.tone = game.status === 'check' ? 'destructive' : 'success';
  }
  for (const who of ['white', 'black']) {
    const taken = game.taken[who];
    $(`${who}-taken`).textContent = taken.map(glyph).join('');
    $(`${who}-taken-text`).textContent = taken.length ? `Took ${taken.length}: ${taken.map((l) => NAMES[l.toLowerCase()]).join(', ')}` : 'Nothing taken';
  }

  const rows = [];
  for (let i = 0; i < game.moves.length; i += 2) {
    rows.push(h('tr', null, h('td', { class: 'text-muted-foreground' }, String(i / 2 + 1)), h('td', null, game.moves[i]), h('td', null, game.moves[i + 1] ?? '')));
  }
  $('moves').replaceChildren(...rows);
  $('moves-empty').hidden = game.moves.length > 0;
  $('moves-scroll').hidden = game.moves.length === 0;
  $('moves-count').textContent = game.moves.length ? `${game.moves.length} ${game.moves.length === 1 ? 'move' : 'moves'}, long algebraic` : 'None yet';
  $('undo').disabled = history.length === 0 || busy;
}

function showRefusal(answer) {
  const [title, text] = REFUSALS[answer] ?? ['The model answered something unexpected', answer];
  $('refusal-title').textContent = title;
  $('refusal-text').textContent = text;
  $('refusal').hidden = false;
  alerts();
  ui.toast(title, { variant: 'destructive' });
}

function alerts() { $('status-alerts').hidden = $('refusal').hidden && $('outcome').hidden; }

function hideRefusal() { $('refusal').hidden = true; alerts(); }

function failed(error) {
  $('refusal-title').textContent = 'The model could not answer';
  $('refusal-text').textContent = String(error && error.message ? error.message : error);
  $('refusal').hidden = false;
  alerts();
}

// ---- Asking the model

async function ask(text) {
  busy = true;
  boardEl.setAttribute('aria-busy', 'true');
  try {
    return await invoke(text);
  } finally {
    busy = false;
    boardEl.removeAttribute('aria-busy');
  }
}

function letGo() { selected = null; offers = []; }

async function choose(square) {
  if (!game || busy) return;
  hideRefusal();
  if (square === selected) { letGo(); draw(); return; }
  const chosen = offers.filter((m) => m.slice(2, 4) === square);
  if (chosen.length > 1) { await promote(chosen); return; }
  if (chosen.length === 1) { await play(chosen[0]); return; }
  let listing;
  try { listing = await ask(`${game.position} ${square}`); } catch (error) { failed(error); return; }
  const moves = listing.startsWith('moves') ? listing.split(' ').slice(1) : [];
  if (moves.length) {
    selected = square;
    offers = moves;
  } else if (selected) {
    // Not a square the model listed: send the move anyway, so the model says why it is refused.
    const move = `${selected}${square}`;
    letGo();
    await play(move);
    return;
  } else {
    letGo();
    const letter = pieceOn(game.position, square);
    if (letter !== '.' && sideOf(letter) === turnOf(game.position) && game.status !== 'mate' && game.status !== 'stalemate') {
      draw();
      $('hint').textContent = `The ${NAMES[letter.toLowerCase()]} on ${square} has no legal move.`;
      return;
    }
  }
  draw();
}

function promote(choices) {
  const dialog = $('promotion');
  const box = $('promotion-choices');
  const white = turnOf(game.position) === 'white';
  box.replaceChildren(...choices.map((move) => {
    const letter = move[4];
    return h('button', { slot: 'button', variant: 'outline', type: 'submit', value: move, class: `h-16 text-4xl ${white ? 'text-foreground' : 'text-muted-foreground'}`, 'aria-label': `Promote to a ${NAMES[letter]}` }, glyph(white ? letter.toUpperCase() : letter));
  }));
  $('promotion-text').textContent = `The pawn reaches ${choices[0].slice(2, 4)}. Choose the piece it becomes.`;
  return new Promise((resolve) => {
    dialog.addEventListener('close', async () => {
      const move = dialog.returnValue;
      dialog.returnValue = '';
      if (move) await play(move); else { letGo(); draw(); }
      resolve();
    }, { once: true });
    dialog.showModal();
  });
}

function describe(before, move, answer) {
  const from = move.slice(0, 2);
  const to = move.slice(2, 4);
  const letter = pieceOn(before, from);
  const [, , , , status, taken] = answer.split(' ');
  const suffix = status === 'mate' ? '#' : status === 'check' ? '+' : '';
  if (letter.toLowerCase() === 'k' && Math.abs(FILES.indexOf(from[0]) - FILES.indexOf(to[0])) === 2) return `${to[0] === 'g' ? 'O-O' : 'O-O-O'}${suffix}`;
  const piece = letter.toLowerCase() === 'p' ? '' : glyph(letter);
  const promoted = move[4] ? `=${glyph(move[4])}` : '';
  return `${piece}${from}${taken !== '.' ? '\u00D7' : '\u2013'}${to}${promoted}${suffix}`;
}

async function play(move) {
  const before = game.position;
  let answer;
  try { answer = await ask(`${before} ${move}`); } catch (error) { failed(error); return; }
  letGo();
  const parts = answer.split(' ');
  if (parts.length !== 6) { showRefusal(answer); draw(); return; }
  const mover = turnOf(before);
  const taken = parts[5];
  history.push(game);
  game = {
    position: parts.slice(0, 4).join(' '),
    status: parts[4],
    last: [move.slice(0, 2), move.slice(2, 4)],
    moves: [...game.moves, describe(before, move, answer)],
    taken: { ...game.taken, [mover]: taken === '.' ? game.taken[mover] : [...game.taken[mover], taken] },
  };
  const letter = pieceOn(before, move.slice(0, 2));
  $('announce').textContent = `${mover} ${NAMES[letter.toLowerCase()]} ${move.slice(0, 2)} to ${move.slice(2, 4)}${taken !== '.' ? `, takes ${NAMES[taken.toLowerCase()]}` : ''}. ${STATUS[game.status].badge}.`;
  if (game.status === 'mate') ui.toast(`Checkmate. ${mover === 'white' ? 'White' : 'Black'} wins.`, { variant: 'success' });
  else if (game.status === 'stalemate') ui.toast('Stalemate. The game is drawn.');
  draw();
}

async function newGame() {
  if (busy) return;
  hideRefusal();
  let answer;
  try { answer = await ask('new'); } catch (error) { failed(error); return; }
  const parts = answer.split(' ');
  history.length = 0;
  letGo();
  game = { position: parts.slice(0, 4).join(' '), status: parts[4], last: null, moves: [], taken: { white: [], black: [] } };
  $('board-frame').removeAttribute('aria-busy');
  draw();
}

function undo() {
  if (busy || history.length === 0) return;
  hideRefusal();
  letGo();
  game = history.pop();
  $('announce').textContent = 'Move taken back.';
  draw();
}

$('new-game').addEventListener('click', newGame);
$('undo').addEventListener('click', undo);
newGame();
```

## app/view/index.html

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Starboard</title>
  <!--
    Starboard, the chess app's page, built only from the Prism design system: components named with data-slot and
    utilities with Tailwind's names, bound to the Deep Space theme in design/theme.json. Every rule is the model's
    (app/src/App.lex.tex): this page sends the position it was given and draws what the model answers.
  -->
  <link rel="icon" href="data:,">
  <link rel="stylesheet" href="prism.css">
  <script src="prism-ui.js"></script>
  <script type="module" src="prism.js"></script>
  <script type="module" src="app.js"></script>
</head>
<body>
  <div data-slot="app">
    <header data-slot="toolbar">
      <div class="flex items-center gap-3 min-w-0">
        <div data-slot="brand">
          <span data-slot="brand-mark" aria-hidden="true"><span data-slot="icon" data-icon="crown"></span></span>
          <h1 data-slot="brand-name">Starboard</h1>
        </div>
        <span data-slot="badge" data-variant="outline" class="hidden sm:inline-flex" data-tooltip="Every rule is decided by the app's model, whose theorems Lean's kernel proved">Proved rules</span>
      </div>
      <div data-slot="button-group" role="group" aria-label="Game actions">
        <button data-slot="button" data-variant="outline" data-size="sm" type="button" id="undo" disabled data-tooltip="Take back the last move">
          <span data-slot="icon" data-icon="undo-2" aria-hidden="true"></span>Undo
        </button>
        <button data-slot="button" data-variant="outline" data-size="sm" type="button" id="new-game">
          <span data-slot="icon" data-icon="rotate-ccw" aria-hidden="true"></span>New game
        </button>
      </div>
    </header>

    <main class="flex-1 w-full max-w-6xl mx-auto grid gap-8 px-4 py-6 md:px-8 md:py-10 lg:grid-cols-12">
      <section class="lg:col-span-7 flex flex-col items-center gap-4 min-w-0" aria-labelledby="board-title">
        <h2 id="board-title" class="sr-only">Board</h2>
        <div class="flex items-center justify-between gap-3 w-full max-w-2xl">
          <div class="flex items-center gap-3 min-w-0">
            <span data-slot="avatar" class="bg-card text-foreground border text-lg" aria-hidden="true">&#x265A;&#xFE0E;</span>
            <div class="grid min-w-0">
              <span class="text-sm font-medium">Black</span>
              <span class="text-xs text-muted-foreground truncate" id="black-taken-text">Nothing taken</span>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <p class="flex flex-wrap justify-end text-xl leading-none text-muted-foreground" id="black-taken" aria-hidden="true"></p>
            <span data-slot="status" data-tone="success" id="black-turn" hidden>To move</span>
          </div>
        </div>

        <div class="grid gap-2 w-full max-w-2xl" id="board-frame" aria-busy="true">
          <div class="flex gap-2">
            <div class="flex flex-col w-4 text-xs font-medium text-muted-foreground select-none" aria-hidden="true"><span class="flex flex-1 items-center justify-center">8</span><span class="flex flex-1 items-center justify-center">7</span><span class="flex flex-1 items-center justify-center">6</span><span class="flex flex-1 items-center justify-center">5</span><span class="flex flex-1 items-center justify-center">4</span><span class="flex flex-1 items-center justify-center">3</span><span class="flex flex-1 items-center justify-center">2</span><span class="flex flex-1 items-center justify-center">1</span></div>
            <div data-slot="board" data-size="8" data-pattern="checker" class="flex-1" id="board" aria-label="Chess board" aria-describedby="hint"></div>
          </div>
          <div class="flex pl-6 text-xs font-medium text-muted-foreground select-none" aria-hidden="true"><span class="flex-1 text-center">a</span><span class="flex-1 text-center">b</span><span class="flex-1 text-center">c</span><span class="flex-1 text-center">d</span><span class="flex-1 text-center">e</span><span class="flex-1 text-center">f</span><span class="flex-1 text-center">g</span><span class="flex-1 text-center">h</span></div>
        </div>

        <div class="flex items-center justify-between gap-3 w-full max-w-2xl">
          <div class="flex items-center gap-3 min-w-0">
            <span data-slot="avatar" class="bg-foreground text-card text-lg" aria-hidden="true">&#x265A;&#xFE0E;</span>
            <div class="grid min-w-0">
              <span class="text-sm font-medium">White</span>
              <span class="text-xs text-muted-foreground truncate" id="white-taken-text">Nothing taken</span>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <p class="flex flex-wrap justify-end text-xl leading-none text-muted-foreground" id="white-taken" aria-hidden="true"></p>
            <span data-slot="status" data-tone="success" id="white-turn" hidden>To move</span>
          </div>
        </div>
      </section>

      <aside class="lg:col-span-5 relative min-w-0" aria-label="Game">
        <div class="flex flex-col gap-6 lg:absolute lg:inset-0">
          <section data-slot="card" aria-labelledby="status-line">
            <div data-slot="card-header">
            <p data-slot="eyebrow" id="eyebrow">Move 1</p>
            <h2 data-slot="card-title" class="font-display text-3xl font-semibold tracking-tight text-balance" id="status-line" aria-live="polite">
              <span class="sr-only">Setting up the board</span><span data-slot="skeleton" class="h-10 w-full" aria-hidden="true"></span>
            </h2>
            <p data-slot="card-description" class="text-pretty" id="hint">Choose a piece to see where it can go.</p>
            <div data-slot="card-action"><span data-slot="badge" data-variant="secondary" id="status-badge">Setting up</span></div>
            </div>
            <div data-slot="card-content" class="grid gap-3" id="status-alerts" hidden>
            <div data-slot="alert" data-variant="destructive" role="alert" id="refusal" hidden>
              <p data-slot="alert-title" id="refusal-title">The model refused the move</p>
              <p data-slot="alert-description" id="refusal-text"></p>
            </div>
            <div data-slot="alert" data-variant="success" role="status" id="outcome" hidden>
              <p data-slot="alert-title" class="flex items-center gap-2"><span data-slot="icon" data-icon="trophy" aria-hidden="true"></span><span id="outcome-title"></span></p>
              <p data-slot="alert-description" id="outcome-text"></p>
            </div>
            </div>
          </section>

          <section data-slot="card" class="flex-1 min-h-0" aria-labelledby="moves-title">
            <div data-slot="card-header">
              <h2 data-slot="card-title" id="moves-title">Moves</h2>
              <p data-slot="card-description" id="moves-count">None yet</p>
            </div>
            <div data-slot="card-content" class="flex flex-col flex-1 min-h-0">
              <div data-slot="empty" id="moves-empty">
                <h3 class="text-sm font-medium">No moves yet</h3>
                <p class="text-sm text-muted-foreground text-balance">White opens. Each move is judged by the proved model before it appears here.</p>
              </div>
              <div data-slot="scroll-area" data-stick="bottom" class="flex-1 min-h-0" tabindex="0" aria-label="Moves played" id="moves-scroll" hidden>
                <table data-slot="table">
                  <caption class="sr-only">Moves played, white and black</caption>
                  <thead><tr><th scope="col">#</th><th scope="col">White</th><th scope="col">Black</th></tr></thead>
                  <tbody id="moves" class="tabular-nums"></tbody>
                </table>
              </div>
            </div>
          </section>

          <p class="text-xs text-muted-foreground text-pretty">The rules are proved by Lean's kernel. This page is authored, not proved: it only draws what the model answers. Arrows move between squares, <kbd data-slot="kbd">Enter</kbd> picks, <kbd data-slot="kbd">Esc</kbd> lets go.</p>
        </div>
      </aside>
    </main>
  </div>

  <dialog data-slot="dialog" id="promotion" aria-labelledby="promotion-title" aria-describedby="promotion-text">
    <form method="dialog" class="grid gap-4">
      <div data-slot="dialog-header">
        <h2 data-slot="dialog-title" id="promotion-title">Promote the pawn</h2>
        <p data-slot="dialog-description" id="promotion-text">Choose the piece it becomes.</p>
      </div>
      <div class="grid grid-cols-4 gap-3" id="promotion-choices"></div>
      <div data-slot="dialog-footer">
        <button data-slot="button" data-variant="ghost" type="submit" value="">Cancel</button>
      </div>
    </form>
  </dialog>

  <p class="sr-only" aria-live="polite" id="announce"></p>
</body>
</html>
```
