# Reference app: messenger

Written by scripts/design-reference.mjs from examples/design/ in the PrismPM repository. Imitate its structure; take the model's protocol from your own model.

A reference app for Prism's design system (DK-54). The product is called Hearth. It shows how to build a conversation app: three conversations with
unread counts, message validation, a slash command and a demo contact who replies, all decided by a LexLean model.
The page is built only from the catalogue, and the model works without a network.

Rebuild it from nothing but prism-code:

```bash
node examples/design/build.mjs messenger <out-dir>
```

This folder holds only the files that differ from a fresh `prism-code init`: the model (`app/src/App.lex.tex`), the
page (`app/view/`), its look (`app/design/theme.json` and the words in `app/DESIGN.md`), the register (`model/ids.toml`), its scenarios (`features/suites/app.feature`) and the
`CONFORMANCE.md` that `build` generates from them. `lexlean.toml` and `lexlean.lock` are the template's, unchanged.

## app/DESIGN.md

```markdown
# Hearth, the look

Hearth is a warm messenger, set on paper rather than white, with one accent.

- Theme: the `terracotta` preset (`app/design/theme.json`), unchanged. That is warm paper, a terracotta accent (#a2462a in light, #f0a487 in dark) and larger radii on surfaces.
- Type: the display face is the preset's serif, a stack that every system has: Iowan Old Style, Palatino Linotype, Palatino, URW Palladio L, P052, Book Antiqua, Georgia, then the generic serif. It sets the wordmark, the conversation's name and the empty state's title at regular weight. Everything else is the brand's sans.
- One accent: terracotta marks the send button, the wordmark's mark, unread counts, my own bubbles and the tint behind contacts' initials. Everything else is ink and paper.
- Icons: few, each with a job. They are the wordmark's mark (message-circle), search, send, the proof mark (shield-check) and the empty conversation.
- Rhythm: 16 px of space around the sidebar, 24 px of padding in the conversation's header, tinted avatars (`data-tone="tint"`) in shadcn `item` rows, and a centred column for the thread and the composer.
- Modes: light, dark and immersive, all from the preset and the catalogue. The page has no colour of its own.
```

## app/design/theme.json

```json
{
  "schema": "prism/theme/1",
  "preset": "terracotta"
}
```

## app/view/app.js

```js
// The messenger's page. The model (app/src/App.lex.tex) decides every answer: whether a message is sent, its id,
// the unread counts, which conversation is read and what each contact replies. This file holds what the model
// answered and draws it. prism.js gives globalThis.prism and prism-ui.js gives globalThis.ui; scripts never import.
//
// The protocol, one line each way:
//   init                       -> ok <state>\n<name>\n<name>\n<name>
//   open <state> <k>           -> ok <state>
//   send <state> <text>        -> ok <state>\n<k> <id> me <text>     or a refusal: empty message, message too long, ...
//   poll <state>               -> ok <state>[\n<k> <id> them <text>]
// <state> is 16 digits: the open conversation, then for each conversation its unread count (one digit), its last
// message id (two) and the id its contact is due to reach (two). A conversation whose last id is below its due id is
// waiting for the contact's reply, which a poll delivers.
const { invoke } = globalThis.prism;
const { h } = globalThis.ui;

// How long the page waits before it asks for a reply: pacing for people to read, never a rule.
const PACE = 900;

const $ = (id) => document.getElementById(id);
const list = $('conversations');
const thread = $('thread');
const form = $('composer');
const input = $('message');
const send = $('send');

let state = null; // the model's last state: { raw, open, conversations: [{ unread, count, due }] }
let names = [];
const messages = []; // per conversation: [{ id, from, text, pending, failed }], as the model answered them

/** The state the model answered, read at the fixed places the protocol gives each number. */
function readState(raw) {
  const conversations = [0, 1, 2].map((k) => {
    const at = 1 + k * 5;
    return { unread: Number(raw[at]), count: Number(raw.slice(at + 1, at + 3)), due: Number(raw.slice(at + 3, at + 5)) };
  });
  return { raw, open: Number(raw[0]), conversations };
}

/** One answer: ok with the next state and what follows it, or the model's refusal in its own words. */
function readAnswer(answer) {
  if (!answer.startsWith('ok ')) return { ok: false, refusal: answer };
  const line = answer.indexOf('\n');
  const head = line < 0 ? answer : answer.slice(0, line);
  return { ok: true, state: readState(head.slice(3)), rest: line < 0 ? '' : answer.slice(line + 1) };
}

/** A message line: `<k> <id> <me|them> <text>`, the text last and whole, line breaks and all. */
function readMessage(rest) {
  const [k, id, from] = rest.split(' ', 3);
  const text = rest.slice(k.length + id.length + from.length + 3);
  return { k: Number(k), id: Number(id), from, text };
}

// Every request waits for the one before it and carries the state that one answered, so no answer is lost.
let queue = Promise.resolve();
function ask(request) {
  const run = queue.then(async () => {
    const answer = readAnswer(await invoke(request(state && state.raw)));
    if (answer.ok) state = answer.state;
    return answer;
  });
  queue = run.catch(() => {});
  return run;
}

const waiting = (k) => state.conversations[k].count < state.conversations[k].due;
const firstName = (k) => names[k].split(' ')[0];

function lastLine(k) {
  if (waiting(k)) return `${firstName(k)} is typing…`;
  const last = messages[k].filter((m) => !m.failed && !m.pending).at(-1);
  if (!last) return 'No messages yet';
  return last.from === 'me' ? `You: ${last.text}` : last.text;
}

// The search box narrows the list the page draws; it changes nothing in the model.
const search = $('search');
const matches = (name) => name.toLowerCase().includes(search.value.trim().toLowerCase());

function drawList() {
  const shown = names.map((name, k) => [name, k]).filter(([name]) => matches(name));
  $('no-match').hidden = shown.length > 0;
  list.replaceChildren(...shown.map(([name, k]) => {
    const { unread } = state.conversations[k];
    const open = state.open === k;
    return h('li', null, h('button', {
      slot: 'item', size: 'sm', type: 'button', 'aria-current': open ? 'true' : false, onclick: () => choose(k),
    },
    h('span', { slot: 'item-media' }, h('span', { slot: 'avatar', size: 'lg', tone: 'tint', 'data-name': name, 'aria-hidden': 'true' })),
    h('span', { slot: 'item-content', class: 'min-w-0' },
      h('span', { slot: 'item-title', class: unread ? 'font-semibold' : '' }, name),
      h('span', { slot: 'item-description', class: waiting(k) ? 'italic truncate' : 'truncate' }, lastLine(k))),
    unread ? h('span', { slot: 'item-actions' }, h('span', { slot: 'badge' }, h('span', { 'aria-hidden': 'true' }, String(unread)), h('span', { class: 'sr-only' }, `${unread} unread`))) : null));
  }));
}

function bubble(m, k) {
  const who = h('span', { class: 'sr-only' }, m.from === 'me' ? 'You: ' : `${names[k]}: `);
  // The refusal, in the model's words.
  const note = m.failed ? h('small', null, `Not sent: ${m.failed}`) : m.pending ? h('span', { class: 'sr-only' }, 'Sending') : null;
  return h('li', { slot: 'bubble', from: m.from, 'data-pending': Boolean(m.pending), 'data-failed': Boolean(m.failed) }, who, m.text, note);
}

function drawThread() {
  const k = state.open;
  const shown = messages[k].map((m) => bubble(m, k));
  if (waiting(k)) shown.push(h('li', { slot: 'bubble', from: 'them', 'data-pending': true }, h('span', { class: 'sr-only' }, `${names[k]} is typing`), h('span', { 'aria-hidden': 'true' }, '•••')));
  thread.replaceChildren(...shown);
  thread.setAttribute('aria-label', `Messages with ${names[k]}`);
  $('messages').setAttribute('aria-label', `Conversation with ${names[k]}`);
  const empty = messages[k].length === 0 && !waiting(k);
  $('empty').hidden = !empty;
  thread.hidden = empty;
  if (empty) {
    $('empty-title').textContent = `No messages with ${firstName(k)} yet`;
  }
}

function drawHeader() {
  const k = state.open;
  $('pane-title').textContent = names[k];
  $('pane-avatar').textContent = names[k].split(' ').map((w) => w[0]).join('');
  $('pane-status').textContent = waiting(k) ? 'typing…' : 'Demo contact · replies come from the model';
  input.placeholder = `Message ${firstName(k)}`;
}

function draw() {
  drawList();
  drawHeader();
  drawThread();
}

function fail(error) {
  $('error-text').textContent = error.message;
  $('error').hidden = false;
}

async function choose(k) {
  if (!state || state.open === k) return;
  try {
    const answer = await ask((raw) => `open ${raw} ${k}`);
    if (!answer.ok) throw new Error(answer.refusal);
    draw();
  } catch (error) { fail(error); }
}

// Ask for replies while the model's state says a contact owes one; the model picks whose and what.
let polling = false;
async function drain() {
  if (polling) return;
  polling = true;
  try {
    while (state.conversations.some((c) => c.count < c.due)) {
      await new Promise((done) => setTimeout(done, PACE));
      const answer = await ask((raw) => `poll ${raw}`);
      if (!answer.ok) throw new Error(answer.refusal);
      if (answer.rest) {
        const m = readMessage(answer.rest);
        messages[m.k].push({ id: m.id, from: m.from, text: m.text });
      }
      draw();
    }
  } catch (error) { fail(error); } finally { polling = false; }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state || send.disabled) return;
  const text = input.value;
  const k = state.open;
  const mine = { from: 'me', text, pending: true };
  messages[k].push(mine);
  input.value = '';
  input.dispatchEvent(new Event('input'));
  send.disabled = true;
  draw();
  try {
    const answer = await ask((raw) => `send ${raw} ${text}`);
    if (answer.ok) {
      const m = readMessage(answer.rest);
      Object.assign(mine, { id: m.id, text: m.text });
    } else mine.failed = answer.refusal;
  } catch (error) {
    mine.failed = error.message;
  }
  mine.pending = false;
  send.disabled = false;
  draw();
  drain();
});

$('empty-action').addEventListener('click', () => input.focus());

async function start() {
  try {
    const answer = readAnswer(await invoke('init'));
    if (!answer.ok) throw new Error(answer.refusal);
    state = answer.state;
    names = answer.rest.split('\n');
    names.forEach(() => messages.push([]));
    $('sidebar').removeAttribute('aria-busy');
    $('loading').remove();
    input.disabled = false;
    search.disabled = false;
    search.addEventListener('input', drawList);
    send.disabled = false;
    draw();
    drain();
  } catch (error) {
    $('pane-status').textContent = 'Not connected';
    fail(error);
  }
}

start();
```

## app/view/index.html

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Hearth</title>
  <!--
    The messenger's page, built from the Prism design system: components named with data-slot and utilities with
    Tailwind's names, bound to the theme's tokens (prism-code design lists them all; check refuses anything else).
    Every rule is the model's (app/src/App.lex.tex). The build writes prism.css, prism-ui.js and prism.js beside
    these files; the page asks the model with
    const { invoke } = globalThis.prism;  const answer = await invoke(text);
  -->
  <link rel="icon" href="data:,">
  <link rel="stylesheet" href="prism.css">
  <script src="prism-ui.js"></script>
  <script type="module" src="prism.js"></script>
  <script type="module" src="app.js"></script>
</head>
<body>
  <div data-slot="app" class="h-screen">
    <div data-slot="split">
      <aside data-slot="sidebar" aria-label="Conversations" id="sidebar" aria-busy="true">
        <div data-slot="sidebar-header" class="gap-4">
          <div data-slot="brand" class="px-2 pt-1">
            <span data-slot="brand-mark" aria-hidden="true"><span data-slot="icon" data-icon="message-circle"></span></span>
            <h1 data-slot="brand-name">Hearth</h1>
          </div>
          <label class="sr-only" for="search">Search conversations</label>
          <div data-slot="input-group">
            <input data-slot="input-group-control" id="search" type="search" placeholder="Search" autocomplete="off" disabled>
            <div data-slot="input-group-addon"><span data-slot="icon" data-icon="search" aria-hidden="true"></span></div>
          </div>
        </div>

        <div data-slot="sidebar-content" class="gap-1">
          <p data-slot="eyebrow" class="px-3">Chats</p>
          <ul data-slot="item-group" class="gap-1" id="conversations">
            <li class="flex items-center gap-3 px-3 py-3" aria-hidden="true"><span data-slot="skeleton" class="size-10 rounded-full"></span><span class="grid flex-1 gap-2"><span data-slot="skeleton" class="h-3 w-16"></span><span data-slot="skeleton" class="h-3 w-full"></span></span></li>
            <li class="flex items-center gap-3 px-3 py-3" aria-hidden="true"><span data-slot="skeleton" class="size-10 rounded-full"></span><span class="grid flex-1 gap-2"><span data-slot="skeleton" class="h-3 w-16"></span><span data-slot="skeleton" class="h-3 w-full"></span></span></li>
            <li class="flex items-center gap-3 px-3 py-3" aria-hidden="true"><span data-slot="skeleton" class="size-10 rounded-full"></span><span class="grid flex-1 gap-2"><span data-slot="skeleton" class="h-3 w-16"></span><span data-slot="skeleton" class="h-3 w-full"></span></span></li>
          </ul>
          <p class="px-3 py-2 text-sm text-muted-foreground" id="no-match" hidden>No conversation matches.</p>
          <p class="sr-only" id="loading">Loading conversations</p>
        </div>

        <div data-slot="sidebar-footer" class="hidden md:flex">
          <p class="flex items-center gap-2 px-2 text-xs text-muted-foreground"><span data-slot="icon" data-icon="shield-check" aria-hidden="true"></span>Every rule and reply is the app's proved model.</p>
        </div>
      </aside>

      <main class="flex flex-col min-h-0 min-w-0">
        <div data-slot="toolbar" class="px-6" id="pane-header">
          <div class="flex items-center gap-3 min-w-0">
            <span data-slot="avatar" data-tone="tint" id="pane-avatar" aria-hidden="true"></span>
            <div class="grid min-w-0">
              <h2 class="font-display text-xl font-normal leading-tight truncate" id="pane-title">Conversation</h2>
              <p class="text-xs text-muted-foreground truncate" id="pane-status">Loading</p>
            </div>
          </div>
          <span data-slot="badge" data-variant="outline" data-tooltip="Every answer is computed by the app's model, whose rules Lean's kernel proved"><span data-slot="icon" data-icon="shield-check" aria-hidden="true"></span>Proved</span>
        </div>

        <div data-slot="scroll-area" data-stick="bottom" class="flex-1" tabindex="0" aria-label="Messages" id="messages">
          <div class="flex flex-col w-full max-w-3xl mx-auto px-2 py-4">
            <div data-slot="alert" data-variant="destructive" role="alert" class="m-4" id="error" hidden>
              <p data-slot="alert-title">The model did not answer</p>
              <p data-slot="alert-description" id="error-text"></p>
            </div>
            <div data-slot="empty" class="m-4" id="empty" hidden>
              <div data-slot="empty-header">
                <div data-slot="empty-icon" data-variant="icon"><span data-slot="icon" data-icon="message-circle" aria-hidden="true"></span></div>
                <h3 data-slot="empty-title" class="font-display text-2xl font-normal" id="empty-title">No messages yet</h3>
                <p data-slot="empty-description">Say hello. Every reply comes from the app's model, on this machine.</p>
              </div>
              <div data-slot="empty-content">
                <button data-slot="button" type="button" id="empty-action">Write the first message</button>
              </div>
            </div>
            <ol data-slot="thread" aria-live="polite" aria-label="Messages" id="thread"></ol>
          </div>
        </div>

        <div class="w-full max-w-3xl mx-auto px-2">
          <form data-slot="composer" id="composer" autocomplete="off">
            <label class="sr-only" for="message">Message</label>
            <textarea data-slot="textarea" data-autosize id="message" rows="1" placeholder="Write a message" disabled></textarea>
            <button data-slot="button" data-size="icon" id="send" type="submit" aria-label="Send" disabled><span data-slot="icon" data-icon="send" aria-hidden="true"></span></button>
          </form>
          <p class="px-4 pb-4 text-center text-xs text-muted-foreground">Enter sends, Shift+Enter starts a line. Try /shrug.</p>
        </div>
      </main>
    </div>
  </div>
</body>
</html>
```
