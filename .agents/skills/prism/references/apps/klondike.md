# Reference app: klondike

Written by scripts/design-reference.mjs from examples/design/ in the PrismPM repository. Imitate its structure; take the model's protocol from your own model.

Klondike solitaire, draw one, built on Prism's design system (DK-54) from the catalogue alone. The model in `app/src/App.lex.tex` decides every deal, draw and move; the page in `app/view/` only draws the table the model answers. It is a reference for any stateful app: the state travels in each request and the next state comes back in the answer.

Rebuild it from nothing but prism-code:

```bash
node examples/design/build.mjs klondike <out-dir>
```

That runs `init`, lays these files over the fresh template, then `lock`, `check`, `build` and `verify`. The files here are only those that differ from a fresh `init`: the model, the page, its look (`app/design/theme.json` and `app/DESIGN.md`), the two ledgers and `CONFORMANCE.md`. `CONFORMANCE.md` is what `build` writes from `model/ids.toml`; it is here because `build.mjs` runs `check` first, and `check` refuses a stale one.

## app/DESIGN.md

```markdown
# Klondike's look

Evergreen: warm paper, one green accent and a serif display, the look of a card table. The felt is the catalogue's table-top; the cards are its printed paper and ink. Icons only where they mean something: the spade in the wordmark, undo, new game, the recycle mark on an empty stock and the trophy of a win.
```

## app/design/theme.json

```json
{
  "schema": "prism/theme/1",
  "name": "Klondike",
  "preset": "evergreen"
}
```

## app/view/app.js

```js
// Klondike's page. The model in app/src deals every table from a seed and judges every draw and move; this page only
// draws the table the model answers, keeps earlier tables for undo, and turns what the person does into requests:
//
//   deal <seed>                    ok <table>
//   draw <table>                   ok <table>, or the refusal
//   move <from> <to> <n> <table>   ok <table>, won <table>, or the refusal
//
// A table is "<moves> <stock>/<waste>/<f1>/<f2>/<f3>/<f4>/<hidden1>.<shown1>/…/<hidden7>.<shown7>", each pile written
// bottom card first, one letter a card: A–M spades, N–Z hearts, a–m diamonds, n–z clubs, each ace to king. A pile is
// named by one character: s stock, w waste, a–d the foundations, 1–7 the columns, and f "whichever foundation takes it".
// prism.js gives globalThis.prism and prism-ui.js gives globalThis.ui; the scripts never import each other.
const { invoke } = globalThis.prism;
const ui = globalThis.ui;

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const WORDS = { A: 'Ace', J: 'Jack', Q: 'Queen', K: 'King' };
const FOUNDATIONS = ['a', 'b', 'c', 'd'];
const COLUMNS = ['1', '2', '3', '4', '5', '6', '7'];
// The table as it is laid out, row by row, for the arrow keys; null is the gap between the waste and the foundations.
const ROWS = [['s', 'w', null, 'a', 'b', 'c', 'd'], COLUMNS];

const $ = (id) => document.getElementById(id);
const pileEl = (code) => $(`pile-${code}`);
const codeOf = (pile) => pile.id.slice(5);
const tableEl = $('table');
const statusEl = $('status');

const cardOf = (letter) => { const n = LETTERS.indexOf(letter); return { rank: RANKS[n % 13], suit: SUITS[Math.floor(n / 13)] }; };
const nameOf = (letter) => { const c = cardOf(letter); return `${WORDS[c.rank] || c.rank} of ${c.suit}`; };
const pileName = (code) => (code === 's' ? 'the stock' : code === 'w' ? 'the waste' : FOUNDATIONS.includes(code) ? `foundation ${FOUNDATIONS.indexOf(code) + 1}` : `column ${code}`);
const cardsIn = (pile) => [...pile.querySelectorAll(':scope > [data-slot=playing-card]')];

/** The model's table, read into piles of letters; nothing here judges it. */
function read(text) {
  const [moves, body] = text.split(' ');
  const parts = body.split('/');
  const piles = { s: parts[0], w: parts[1], a: parts[2], b: parts[3], c: parts[4], d: parts[5] };
  COLUMNS.forEach((k, i) => { const [hidden, shown] = parts[6 + i].split('.'); piles[k] = { hidden, shown }; });
  return { moves: Number(moves), piles };
}

let table = null; // the current table, exactly as the model answered it
let seed = null;
let busy = false;
const history = []; // the tables before it, for undo

// ---- Drawing the table. The runtime draws each card's corner and names it from that ("Q, Queen of hearts").

const faceDown = () => ui.h('div', { slot: 'playing-card', face: 'down', 'aria-hidden': 'true' });
const faceUp = (letter, covered) => {
  const c = cardOf(letter);
  return covered
    ? ui.h('div', { slot: 'playing-card', face: 'up', rank: c.rank, suit: c.suit, 'aria-hidden': 'true' })
    : ui.h('button', { slot: 'playing-card', face: 'up', rank: c.rank, suit: c.suit, type: 'button', 'data-letter': letter });
};
/** An empty pile a picked card can be dropped on is itself a control, so the keyboard can reach it. */
const target = (pile, label, droppable) => {
  pile.setAttribute('aria-label', label);
  if (droppable) { pile.setAttribute('role', 'button'); pile.tabIndex = 0; } else { pile.setAttribute('role', 'group'); pile.removeAttribute('tabindex'); }
};

function draw() {
  const { moves, piles } = read(table);
  const stock = pileEl('s');
  stock.replaceChildren(...(piles.s.length ? [faceDown()] : []));
  stock.setAttribute('aria-label', piles.s.length ? `Stock, ${piles.s.length} cards: draw one` : piles.w.length ? 'Stock is empty: turn the waste over' : 'Stock and waste are empty');
  $('stock-count').textContent = String(piles.s.length);
  $('stock-count').hidden = piles.s.length === 0;
  $('recycle').toggleAttribute('hidden', !(piles.s.length === 0 && piles.w.length > 0));

  for (const code of ['w', ...FOUNDATIONS]) {
    const letters = piles[code];
    const pile = pileEl(code);
    const shown = [];
    if (letters.length > 1) shown.push(faceUp(letters.at(-2), true)); // the card beneath shows while the top is dragged
    if (letters.length) shown.push(faceUp(letters.at(-1), false));
    pile.replaceChildren(...shown);
    const name = code === 'w' ? 'Waste' : `Foundation ${FOUNDATIONS.indexOf(code) + 1}`;
    target(pile, letters.length ? `${name}, ${letters.length} ${letters.length === 1 ? 'card' : 'cards'}` : `${name}, empty`, code !== 'w' && letters.length === 0);
  }

  for (const k of COLUMNS) {
    const { hidden, shown } = piles[k];
    const pile = pileEl(k);
    pile.replaceChildren(...[...hidden].map(faceDown), ...[...shown].map((l) => faceUp(l, false)));
    const label = shown.length ? `Column ${k}${hidden.length ? `, ${hidden.length} face down` : ''}` : `Column ${k}, empty`;
    target(pile, label, shown.length === 0);
  }

  const home = FOUNDATIONS.reduce((n, f) => n + piles[f].length, 0);
  $('moves').textContent = String(moves);
  $('home').textContent = `${home}/52`;
  $('progress').value = home;
  $('title').textContent = `Deal ${seed}`;
  $('undo').disabled = history.length === 0;
  tableEl.removeAttribute('aria-busy');
}

// ---- Asking the model

const say = (text) => { statusEl.textContent = text; };
/** A refusal in the model's words, said where it stays (the status line) and as a toast. */
function refuse(answer) {
  const words = answer.startsWith('illegal move: ') ? answer.slice(14) : 'The model refused the request';
  const sentence = `${words[0].toUpperCase()}${words.slice(1)}.`;
  say(sentence);
  ui.toast(sentence, { variant: 'destructive' });
}
function failed(error) {
  $('failure-text').textContent = String(error && error.message ? error.message : error);
  $('failure').hidden = false;
  say('The model did not answer.');
}
/** The runtime's pick, dropped: the page redraws the cards it pointed at. */
const unpick = () => ui.unpick();

/** Ask the model; on ok or won, keep the table it answers (and the one before, for undo) and draw it. */
async function ask(line, { keep = true } = {}) {
  if (busy) return null;
  busy = true;
  tableEl.setAttribute('aria-busy', 'true');
  let answer;
  try {
    answer = await invoke(line);
  } catch (error) {
    busy = false;
    tableEl.removeAttribute('aria-busy');
    failed(error);
    return null;
  }
  busy = false;
  tableEl.removeAttribute('aria-busy');
  $('failure').hidden = true;
  const word = answer.slice(0, answer.indexOf(' '));
  if (word !== 'ok' && word !== 'won') { refuse(answer); return null; }
  unpick();
  if (keep && table !== null) history.push(table);
  table = answer.slice(word.length + 1);
  draw();
  return word;
}

async function deal(next) {
  seed = next;
  history.length = 0;
  table = null;
  if (await ask(`deal ${seed}`, { keep: false })) say(`Deal ${seed} is on the table. Drag a card, or pick one and then where it goes.`);
}
const newSeed = () => Math.floor(Math.random() * 1e9);

async function drawCard() {
  if (table === null) return;
  const hadFocus = tableEl.contains(document.activeElement);
  const before = read(table).piles;
  if (await ask(`draw ${table}`)) {
    const after = read(table).piles;
    say(before.s.length ? `Drew the ${nameOf(after.w.at(-1))}.` : 'Turned the waste over onto the stock.');
    if (hadFocus) pileEl('s').focus();
  }
}

async function move(from, to, count) {
  if (table === null) return;
  const hadFocus = tableEl.contains(document.activeElement);
  const before = read(table).piles;
  const letters = typeof before[from] === 'string' ? before[from] : before[from].shown;
  const moving = letters.at(-count);
  const word = await ask(`move ${from} ${to} ${count} ${table}`);
  if (!word) return;
  const after = read(table).piles;
  const landed = to === 'f' ? FOUNDATIONS.find((f) => after[f].at(-1) === moving) : to;
  say(`Moved the ${nameOf(moving)}${count > 1 ? ` and ${count - 1} more` : ''} to ${pileName(landed)}.`);
  if (hadFocus) { const card = cardsIn(pileEl(landed)).find((c) => c.dataset.letter === moving); (card || pileEl(landed)).focus(); }
  if (word === 'won') {
    $('won-text').textContent = `In ${read(table).moves} moves, deal ${seed}.`;
    $('won').showModal();
  }
}

/** Send a face-up card, and the cards on it, to whichever foundation takes it: the model chooses. */
function sendHome(card) {
  const pile = card.closest('[data-slot=pile]');
  const cards = cardsIn(pile);
  move(codeOf(pile), 'f', cards.length - cards.indexOf(card));
}

function undo() {
  if (busy || history.length === 0) return;
  unpick();
  table = history.pop();
  draw();
  say('Took back the last move.');
}

function askNewGame() {
  if (table !== null && read(table).moves > 0 && !$('won').open) $('confirm-new').showModal();
  else deal(newSeed());
}

// ---- What the person does

// The runtime turns a drag, or a pick and a drop, into one ui:move; the model judges it.
document.addEventListener('ui:move', (event) => {
  const { from, to, count } = event.detail;
  move(from.slice(5), to.slice(5), count);
});
// The runtime lifts a picked card and announces the pick; the page has nothing to add.
document.addEventListener('dblclick', (event) => {
  const card = event.target.closest('[data-slot=playing-card][data-face=up]');
  if (card && card.tagName === 'BUTTON') sendHome(card);
});

const stockEl = pileEl('s');
stockEl.addEventListener('click', (event) => { event.stopPropagation(); unpick(); drawCard(); });

// Enter or Space on an empty pile drops what is picked there, as a click would; on the stock it draws.
tableEl.addEventListener('keydown', (event) => {
  const el = event.target;
  if ((event.key === 'Enter' || event.key === ' ') && el.matches('[data-slot=pile][role=button]')) {
    event.preventDefault();
    el.click();
    return;
  }
  const step = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[event.key];
  if (!step) return;
  const pile = el.closest('[data-slot=pile]');
  if (!pile) return;
  event.preventDefault();
  arrow(pile, el, step);
});

/** Where focus goes in a pile: its top face-up card, else the pile when it is a control. */
const stopOf = (code) => {
  if (code === null) return null;
  const pile = pileEl(code);
  const cards = cardsIn(pile).filter((c) => c.tagName === 'BUTTON');
  return cards.at(-1) || (pile.tabIndex === 0 ? pile : null);
};
function arrow(pile, el, [dr, dc]) {
  const code = codeOf(pile);
  const r = ROWS[0].includes(code) ? 0 : 1;
  const c = ROWS[r].indexOf(code);
  if (dr && r === 1) { // up and down walk a column's face-up cards before leaving it
    const cards = cardsIn(pile).filter((x) => x.tagName === 'BUTTON');
    const i = cards.indexOf(el);
    const j = i + dr;
    if (i >= 0 && j >= 0 && j < cards.length) { cards[j].focus(); return; }
    if (dr > 0) return;
  }
  if (dr) {
    const row = ROWS[r + dr];
    if (!row) return;
    for (const d of [0, -1, 1, -2, 2, -3, 3]) { const s = stopOf(row[c + d] ?? null); if (s) { s.focus(); return; } }
    return;
  }
  for (let k = c + dc; k >= 0 && k < ROWS[r].length; k += dc) { const s = stopOf(ROWS[r][k]); if (s) { s.focus(); return; } }
}

document.addEventListener('keydown', (event) => {
  if (event.defaultPrevented || event.altKey || event.metaKey || document.querySelector('dialog[open]')) return;
  if (event.target instanceof HTMLElement && event.target.matches('input, textarea, select')) return;
  const key = event.key.toLowerCase();
  if (event.ctrlKey) { if (key === 'z') { event.preventDefault(); undo(); } return; }
  if (key === 'd') drawCard();
  else if (key === 'u') undo();
  else if (key === 'n') askNewGame();
  else if (key === 'f') { const card = document.activeElement?.closest?.('button[data-slot=playing-card]'); if (card) sendHome(card); }
});

$('undo').addEventListener('click', undo);
$('new').addEventListener('click', askNewGame);
$('confirm-deal').addEventListener('click', () => { $('confirm-new').close(); deal(newSeed()); });
$('again').addEventListener('click', () => { $('won').close(); deal(newSeed()); });

// A deal to start: the one the address names (#seed=42), else a new one. Nothing takes focus.
const named = /seed=(\d{1,9})/.exec(location.hash);
deal(named ? Number(named[1]) : newSeed());
```

## app/view/index.html

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Klondike</title>
  <!--
    Klondike, draw one. The model (app/src) deals every table from a seed and judges every draw and move; this page
    only draws the table it answers. Built from the Prism design system alone, in the Evergreen look (app/design):
    a wordmark, a serif title, one green accent, table-top, pile and playing-card with the runtime's drag and drop.
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
      <div data-slot="brand">
        <span data-slot="brand-mark" aria-hidden="true"><span data-slot="icon" data-icon="spade"></span></span>
        <h1 data-slot="brand-name">Klondike</h1>
      </div>
      <div data-slot="button-group" role="group" aria-label="Game">
        <button data-slot="button" data-variant="outline" data-size="sm" id="undo" type="button" aria-keyshortcuts="U" data-tooltip="Undo the last move (U)" disabled>
          <span data-slot="icon" data-icon="undo-2" aria-hidden="true"></span>
          Undo
        </button>
        <button data-slot="button" data-variant="outline" data-size="sm" id="new" type="button" aria-keyshortcuts="N" data-tooltip="Deal a new game (N)">
          <span data-slot="icon" data-icon="sparkles" aria-hidden="true"></span>
          New game
        </button>
      </div>
    </header>

    <main class="flex flex-col flex-1 gap-6 w-full max-w-3xl lg:max-w-4xl mx-auto px-4 py-8 md:py-12">
      <div class="flex flex-wrap items-end justify-between gap-6">
        <div class="grid gap-2 min-w-0">
          <h2 class="font-display text-4xl font-normal tracking-tight" id="title">Deal</h2>
          <p class="text-sm text-muted-foreground text-pretty">Solitaire, draw one. Every deal and move is judged by the app's model, whose rules Lean's kernel proved.</p>
        </div>
        <dl class="grid grid-cols-2 gap-4 w-full sm:w-auto">
          <div data-slot="stat" class="px-5 py-3"><dt data-slot="stat-label">Moves</dt><dd data-slot="stat-value" class="text-xl" id="moves">0</dd></div>
          <div data-slot="stat" class="px-5 py-3">
            <dt data-slot="stat-label">Cards home</dt>
            <dd data-slot="stat-value" class="grid gap-2 text-xl"><span id="home">0/52</span><progress data-slot="progress" id="progress" value="0" max="52" aria-label="Cards on the foundations"></progress></dd>
          </div>
        </dl>
      </div>

      <div data-slot="alert" data-variant="destructive" role="alert" id="failure" hidden>
        <p data-slot="alert-title">The model did not answer</p>
        <p data-slot="alert-description" id="failure-text">Try dealing again.</p>
      </div>

      <section data-slot="table-top" id="table" class="grid gap-4 md:gap-6 p-2 md:p-6 select-none" aria-label="Klondike table" aria-busy="true">
        <div class="grid grid-cols-7 gap-2 md:gap-4">
          <div class="relative grid">
            <div data-slot="pile" id="pile-s" role="button" tabindex="0" aria-keyshortcuts="D" aria-label="Stock"></div>
            <span data-slot="badge" data-variant="secondary" class="hidden sm:inline-flex absolute bottom-1 right-1 tabular-nums pointer-events-none" id="stock-count" aria-hidden="true" hidden></span>
            <span class="absolute inset-0 grid place-items-center text-muted-foreground pointer-events-none" id="recycle" aria-hidden="true" hidden><span data-slot="icon" data-icon="rotate-ccw" data-size="lg"></span></span>
          </div>
          <div data-slot="pile" id="pile-w" role="group" aria-label="Waste"></div>
          <div aria-hidden="true"></div>
          <div data-slot="pile" id="pile-a" role="group" aria-label="Foundation 1"></div>
          <div data-slot="pile" id="pile-b" role="group" aria-label="Foundation 2"></div>
          <div data-slot="pile" id="pile-c" role="group" aria-label="Foundation 3"></div>
          <div data-slot="pile" id="pile-d" role="group" aria-label="Foundation 4"></div>
        </div>
        <div class="grid grid-cols-7 gap-2 md:gap-4 items-start">
          <div data-slot="pile" id="pile-1" role="group" data-fan="down" aria-label="Column 1"></div>
          <div data-slot="pile" id="pile-2" role="group" data-fan="down" aria-label="Column 2"></div>
          <div data-slot="pile" id="pile-3" role="group" data-fan="down" aria-label="Column 3"></div>
          <div data-slot="pile" id="pile-4" role="group" data-fan="down" aria-label="Column 4"></div>
          <div data-slot="pile" id="pile-5" role="group" data-fan="down" aria-label="Column 5"></div>
          <div data-slot="pile" id="pile-6" role="group" data-fan="down" aria-label="Column 6"></div>
          <div data-slot="pile" id="pile-7" role="group" data-fan="down" aria-label="Column 7"></div>
        </div>
      </section>

      <p class="text-sm text-muted-foreground min-h-5" id="status" role="status" aria-live="polite">Dealing…</p>
      <p class="hidden md:block text-xs text-muted-foreground leading-relaxed">
        Drag a card, or click it and then where it goes. Double-click sends a card home.
        Keys: <kbd data-slot="kbd">Enter</kbd> picks and drops, <kbd data-slot="kbd-group"><kbd data-slot="kbd">←</kbd><kbd data-slot="kbd">→</kbd></kbd> move between piles,
        <kbd data-slot="kbd">F</kbd> sends home, <kbd data-slot="kbd">D</kbd> draws, <kbd data-slot="kbd">U</kbd> or <kbd data-slot="kbd-group"><kbd data-slot="kbd">Ctrl</kbd><kbd data-slot="kbd">Z</kbd></kbd> undoes, <kbd data-slot="kbd">N</kbd> deals.
      </p>
    </main>
  </div>

  <dialog data-slot="dialog" id="won" aria-labelledby="won-title">
    <div data-slot="dialog-header">
      <h2 data-slot="dialog-title" class="font-display text-2xl font-normal" id="won-title">You won</h2>
      <p data-slot="dialog-description">The model checked every move on the way.</p>
    </div>
    <div data-slot="item" data-variant="muted">
      <div data-slot="item-media" data-variant="icon"><span data-slot="icon" data-icon="trophy" aria-hidden="true"></span></div>
      <div data-slot="item-content">
        <div data-slot="item-title">All 52 cards are home</div>
        <p data-slot="item-description" id="won-text">In 0 moves.</p>
      </div>
    </div>
    <div data-slot="dialog-footer">
      <button data-slot="button" data-variant="outline" type="button" data-close>Look at the table</button>
      <button data-slot="button" type="button" id="again">Deal again</button>
    </div>
  </dialog>

  <dialog data-slot="dialog" id="confirm-new" aria-labelledby="confirm-title">
    <div data-slot="dialog-header">
      <h2 data-slot="dialog-title" class="font-display text-2xl font-normal" id="confirm-title">Deal a new game?</h2>
      <p data-slot="dialog-description">This game ends, and its moves cannot be undone after.</p>
    </div>
    <div data-slot="dialog-footer">
      <button data-slot="button" data-variant="outline" type="button" data-close>Keep playing</button>
      <button data-slot="button" type="button" id="confirm-deal">New game</button>
    </div>
  </dialog>
</body>
</html>
```
