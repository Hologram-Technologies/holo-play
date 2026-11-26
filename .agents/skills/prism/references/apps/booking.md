# Reference app: booking

Written by scripts/design-reference.mjs from examples/design/ in the PrismPM repository. Imitate its structure; take the model's protocol from your own model.

Verbena, a salon's bookings for one week. It is the design system's reference for a form-led app with a landing screen: a hero, then the booking as four numbered steps of choice cards. The model decides everything: the services and their lengths, the opening hours, which times are free, and every refusal. The page sends a command with the bookings the model last answered, then draws what comes back.

```bash
node examples/design/build.mjs booking <out-dir>   # init, lay these files over it, lock, check, build, verify
```

This folder holds only the files that differ from a fresh `prism-code init`: the model (`app/src/App.lex.tex`), the page (`app/view/`), the look (`app/design/theme.json`, `app/DESIGN.md`), the ledgers (`model/ids.toml`, `features/suites/app.feature`), the `CONFORMANCE.md` the build generates from them, and `prism.toml`.

## app/DESIGN.md

```markdown
# Verbena, the look

Verbena is a hair salon's booking page: a landing screen, then the booking as four numbered steps.

- **Theme:** the `paper` preset (`app/design/theme.json`), unchanged. That is cream paper (#fcfbf8), white cards, near-black ink and hairline borders, in light and dark.
- **One accent:** ink. The wordmark's mark, the large button, the step numbers and the chosen card are all near-black on cream. There is no second colour; green and red appear only for the confirmation and the refusals.
- **Type:** the preset's serif display face, a stack every system has, at regular weight for the wordmark, the headline, the card titles and the step titles. Everything else is the brand's sans, with tabular figures for times.
- **Landing:** a chip above a two-line serif headline, one paragraph, a button of size `xl` and a quiet link, with a white card of the week's opening hours beside it.
- **Form:** numbered steps in one card. Every choice is a card with a quiet second line: a service with its length and price, a stylist with their role, a day with its hours, a time.
- **Icons:** six, each with a job: scissors in the wordmark, sparkles in the chip, a calendar in the empty states, an arrow on the main button, a cross to cancel and a shield on the proof note.
- **Rhythm:** 48 px between the sections, 32 px between the steps, 12 px between the cards of a step.
- **Modes:** light, dark and immersive, all from the preset and the catalogue. The page has no CSS and no colour of its own.
```

## app/design/theme.json

```json
{
  "schema": "prism/theme/1",
  "preset": "paper"
}
```

## app/view/app.js

```js
// Verbena's booking page. The model decides everything: the services and their lengths, the opening hours, which
// times are free, and every refusal. This file sends a command with the bookings the model last answered, and shows
// what comes back. No rule lives here (R1).
//
// The protocol, one request and one answer, both plain text:
//   request  <command>\n<bookings>
//   command  menu | list | free <service> <stylist> <day> | book <service> <stylist> <day> <HH:MM> <name> | cancel <n>
//   answer   ok menu, then a line per service, stylist and day
//            ok bookings=<n> booked=<half-hours>[ at=<n>]\n<bookings>      (list, book, cancel)
//            ok free <HH:MM> ...   or   ok closed                           (free)
//            or one refusal sentence, and then the bookings are unchanged.
//   bookings one line each, in the model's order: <stylist><day><HHMM><service> <name>, digits naming the menu's rows
const { invoke } = globalThis.prism;
const { ui } = globalThis;
const { h } = ui;

const $ = (id) => document.getElementById(id);
const pounds = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });
const KEY = 'prism-booking-state';

// Which step a refusal belongs to: the model's registered refusal sentences, matched exactly.
const PLACE = {
  'Unknown service.': 'service',
  'Unknown stylist.': 'stylist',
  'Unknown day.': 'day',
  'The salon is closed that day.': 'day',
  'Choose a time on the half-hour, like 10:30.': 'time',
  'That time is outside opening hours.': 'time',
  'That service would run past closing.': 'time',
  'That stylist is already booked then.': 'time',
  'A booking needs a name.': 'name',
  'The name is too long.': 'name',
};
const PLACES = ['service', 'stylist', 'day', 'time', 'name'];

const menu = { services: [], stylists: [], days: [] }; // what the model offers, in its order
let state = ''; // the bookings the model last answered, sent back with every request
let pending = 0; // the booking the cancel dialog asks about
let asked = 0; // the latest request for free times; an older answer is dropped

const remember = (text) => { try { localStorage.setItem(KEY, text); } catch { /* storage is optional */ } };
const recall = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const send = (command) => invoke(state ? `${command}\n${state}` : command);
const picked = (name) => document.querySelector(`input[name=${name}]:checked`)?.value ?? '';
const named = (rows, word) => rows.find((row) => row.word === word);

// The menu: one line per service, stylist and day, as the model wrote them.
function readMenu(answer) {
  for (const line of answer.split('\n').slice(1)) {
    const [kind, word, ...rest] = line.split(' ');
    if (kind === 'service') menu.services.push({ word, minutes: rest[0], price: pounds.format(Number(rest[1])), title: rest.slice(2).join(' ') });
    if (kind === 'stylist') { const [name, role] = rest.join(' ').split(': '); menu.stylists.push({ word, name, role }); }
    if (kind === 'day') { const closed = rest[0] === 'closed'; menu.days.push({ word, closed, hours: closed ? 'Closed' : `${rest[0]} to ${rest[1]}`, title: rest.slice(closed ? 1 : 2).join(' ') }); }
  }
}

// One option as a card: a radio in its label, a title and a quiet second line.
function choice(name, value, title, line) {
  const input = h('input', { type: 'radio', name, value });
  return h('label', { slot: 'choice' }, input, h('span', { class: 'font-medium' }, title), line ? h('span', { class: 'text-muted-foreground' }, line) : null);
}

function drawMenu() {
  $('service').replaceChildren(...menu.services.map((s) => choice('service', s.word, s.title, `${s.minutes} min · ${s.price}`)));
  $('stylist').replaceChildren(...menu.stylists.map((s) => choice('stylist', s.word, s.name, s.role)));
  $('day').replaceChildren(...menu.days.map((d) => choice('day', d.word, d.title, d.hours)));
  $('hours').replaceChildren(...menu.days.map((d) => {
    const hours = h('td', { 'data-align': 'end' }, d.hours);
    hours.classList.add(d.closed ? 'text-muted-foreground' : 'tabular-nums');
    return h('tr', null, h('td', { class: 'font-medium' }, d.title), hours);
  }));
}

// A line of the bookings, read against the menu.
function read(line) {
  return { stylist: menu.stylists[Number(line[0])], day: menu.days[Number(line[1])], time: `${line.slice(2, 4)}:${line.slice(4, 6)}`, service: menu.services[Number(line[6])], name: line.slice(8) };
}
const lines = () => (state ? state.split('\n') : []);
const span = (halfHours) => { const hours = Math.floor(halfHours / 2); return `${hours ? `${hours} h` : ''}${hours && halfHours % 2 ? ' ' : ''}${halfHours % 2 ? '30 min' : ''}`; };

// Take an `ok bookings=…` answer: keep its bookings and draw them.
function accept(answer) {
  const cut = answer.indexOf('\n');
  const figures = Object.fromEntries(answer.slice(0, cut).split(' ').slice(1).map((w) => w.split('=')));
  state = answer.slice(cut + 1);
  remember(state);
  const items = lines().map((line, i) => {
    const b = read(line);
    // The icon is named with dataset.icon and a literal, where the build finds it and compiles it into prism.css.
    const cross = h('span', { slot: 'icon', 'aria-hidden': 'true' });
    cross.dataset.icon = 'x';
    const cancel = h('button', {
      slot: 'button', variant: 'ghost', size: 'icon', type: 'button', 'data-open': 'cancel-dialog', 'data-tooltip': 'Cancel',
      'aria-label': `Cancel ${b.service.title} for ${b.name}, ${b.day.title} at ${b.time}`,
      onclick: () => { pending = i + 1; $('cancel-text').textContent = `${b.service.title} with ${b.stylist.name}, ${b.day.title} at ${b.time}, for ${b.name}. The time becomes free at once.`; },
    }, cross);
    return h('li', { slot: 'item', variant: 'outline' },
      h('div', { slot: 'item-media' }, h('span', { slot: 'avatar', 'data-name': b.stylist.name, 'aria-hidden': 'true' })),
      h('div', { slot: 'item-content' },
        h('div', { slot: 'item-title' }, `${b.day.title} ${b.time} · ${b.name}`),
        h('p', { slot: 'item-description' }, `${b.service.title} with ${b.stylist.name}`)),
      h('div', { slot: 'item-actions' }, cancel));
  });
  const count = Number(figures.bookings);
  $('booking-list').replaceChildren(...items);
  $('booking-list').hidden = count === 0;
  $('bookings-empty').hidden = count !== 0;
  $('bookings-loading').hidden = true;
  $('bookings-description').textContent = count === 0 ? 'This week' : `${count} this week, ${span(Number(figures.booked))} in the chair`;
  $('count').textContent = String(count);
  $('count').setAttribute('aria-label', `${count} booked`);
  $('count').hidden = count === 0;
  $('main').removeAttribute('aria-busy');
  return figures;
}

// Refusals: show the model's own words under the step they concern, and clear them on the next try.
function showError(name, words) {
  const control = $(name);
  const error = $(`${name}-error`);
  $(`${name}-field`).toggleAttribute('data-invalid', true);
  control.setAttribute('aria-invalid', 'true');
  control.setAttribute('aria-describedby', `${name}-error`);
  error.textContent = words;
  error.setAttribute('role', 'alert');
  error.hidden = false;
}
function clearError(name) {
  const field = $(`${name}-field`);
  if (!field.hasAttribute('data-invalid')) return;
  field.removeAttribute('data-invalid');
  $(name).removeAttribute('aria-invalid');
  if ($(`${name}-hint`) && name === 'name') $(name).setAttribute('aria-describedby', 'name-hint'); else $(name).removeAttribute('aria-describedby');
  $(`${name}-error`).hidden = true;
}
function refused(words) {
  const place = PLACE[words];
  if (place) { showError(place, words); return; }
  $('book-alert-text').textContent = words;
  $('book-alert').hidden = false;
}
function failed(error) {
  $('failure-text').textContent = error && error.message ? error.message : String(error);
  $('failure').hidden = false;
  $('main').removeAttribute('aria-busy');
}

// The free times for the service, stylist and day chosen: only what the model lists.
async function showTimes() {
  const service = picked('service'), stylist = picked('stylist'), day = picked('day');
  const mine = asked += 1;
  clearError('time');
  if (!service || !stylist || !day) {
    $('time-hint').hidden = false;
    $('time').hidden = true;
    $('time-empty').hidden = true;
    return;
  }
  let answer;
  try { answer = await send(`free ${service} ${stylist} ${day}`); } catch (error) { failed(error); return; }
  if (mine !== asked) return;
  const times = answer.startsWith('ok free') ? answer.split(' ').slice(2) : [];
  const kept = picked('time');
  $('time-hint').hidden = true;
  $('time').replaceChildren(...times.map((t) => { const c = choice('time', t, t, null); c.classList.add('text-center', 'tabular-nums'); if (t === kept) c.firstChild.checked = true; return c; }));
  $('time').hidden = times.length === 0;
  $('time-empty').hidden = times.length !== 0 || !answer.startsWith('ok ');
  if (answer === 'ok closed') {
    $('time-empty-title').textContent = `Closed on ${named(menu.days, day).title}`;
    $('time-empty-text').textContent = 'Pick another day to see its free times.';
  } else if (times.length === 0 && answer.startsWith('ok ')) {
    $('time-empty-title').textContent = `No free times on ${named(menu.days, day).title}`;
    $('time-empty-text').textContent = `${named(menu.stylists, stylist).name} has no room for it that day. Try another day or stylist.`;
  } else if (!answer.startsWith('ok ')) {
    showError(PLACE[answer] ?? 'time', answer);
  }
}

for (const name of ['service', 'stylist', 'day']) $(name).addEventListener('change', () => { clearError(name); showTimes(); });
$('time').addEventListener('change', () => clearError('time'));
$('name').addEventListener('input', () => clearError('name'));

async function busy(button, work) {
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  try { return await work(); } catch (error) { failed(error); return null; } finally { button.disabled = false; button.removeAttribute('aria-busy'); }
}

// Confirm: send what is chosen, as it is. The model says what is missing or not allowed.
$('book').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('confirm');
  if (button.disabled) return;
  for (const name of PLACES) clearError(name);
  $('book-alert').hidden = true;
  $('booked').hidden = true;
  const answer = await busy(button, () => send(`book ${picked('service')} ${picked('stylist')} ${picked('day')} ${picked('time')} ${$('name').value.trim()}`));
  if (answer === null) return;
  if (!answer.startsWith('ok ')) { refused(answer); return; }
  const figures = accept(answer);
  const b = read(lines()[Number(figures.at) - 1]);
  $('booked-title').textContent = `Booked: ${b.service.title} with ${b.stylist.name}`;
  $('booked-text').textContent = `${b.day.title} at ${b.time}, ${b.service.minutes} min, ${b.service.price}, under the name ${b.name}.`;
  $('booked').hidden = false;
  $('name').value = '';
  await showTimes();
});

// Cancel a booking, after the dialog confirms it.
$('cancel-confirm').addEventListener('click', async () => {
  const answer = await busy($('cancel-confirm'), () => send(`cancel ${pending}`));
  $('cancel-dialog').close();
  if (answer === null) return;
  if (!answer.startsWith('ok ')) { ui.toast(answer, { variant: 'destructive' }); return; }
  accept(answer);
  $('booked').hidden = true;
  ui.toast('Booking cancelled');
  await showTimes();
});

// The landing screen's buttons go to a section of this page.
for (const link of document.querySelectorAll('[data-go]')) {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    $(link.dataset.go).scrollIntoView({ behavior: ui.reduced() ? 'auto' : 'smooth', block: 'start' });
  });
}

// The first answers: the menu, then the bookings this browser kept, if the model accepts them, or an empty book.
(async () => {
  try {
    readMenu(await invoke('menu'));
    drawMenu();
    state = recall() ?? '';
    let answer = await send('list');
    if (!answer.startsWith('ok ')) { state = ''; answer = await send('list'); }
    accept(answer);
  } catch (error) {
    failed(error);
  }
})();
```

## app/view/index.html

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Verbena</title>
  <!--
    Verbena, a salon's booking page: a landing screen, then the booking as four numbered steps. It is built from the
    Prism design system alone (prism-code design lists it), and every rule is the model's (app/src/): the services,
    the opening hours, which times are free and every refusal. The page sends a command with the bookings the model
    last answered and draws what comes back.
  -->
  <link rel="icon" href="data:,">
  <link rel="stylesheet" href="prism.css">
  <script src="prism-ui.js"></script>
  <script type="module" src="prism.js"></script>
  <script type="module" src="app.js"></script>
</head>
<body>
  <div data-slot="app">
    <header data-slot="toolbar" class="px-4 md:px-8">
      <div data-slot="brand">
        <span data-slot="brand-mark" aria-hidden="true"><span data-slot="icon" data-icon="scissors"></span></span>
        <span data-slot="brand-name">Verbena</span>
      </div>
      <nav class="flex items-center gap-2" aria-label="Sections">
        <a data-slot="button" data-variant="ghost" href="#bookings" data-go="bookings">Your bookings<span data-slot="badge" data-variant="secondary" id="count" hidden></span></a>
        <a data-slot="button" href="#book" data-go="book" class="hidden sm:inline-flex">Book a visit</a>
      </nav>
    </header>

    <main data-slot="page" id="main" class="grid gap-12 pb-16" aria-busy="true">
      <div class="grid gap-8 lg:grid-cols-2 lg:gap-12 items-center">
        <section data-slot="hero">
          <span data-slot="badge" data-variant="chip"><span data-slot="icon" data-icon="sparkles" aria-hidden="true"></span>Now booking this week</span>
          <h1>Good hair.<br>No waiting.</h1>
          <p>Choose a service, a stylist and a time that is truly free. A proved model keeps the book, so no chair is ever promised twice.</p>
          <div class="flex items-center gap-6 flex-wrap">
            <a data-slot="button" data-size="xl" href="#book" data-go="book">Book a visit <span data-slot="icon" data-icon="arrow-right" aria-hidden="true"></span></a>
            <a data-slot="button" data-variant="link" href="#bookings" data-go="bookings">See your bookings</a>
          </div>
        </section>

        <section data-slot="card" class="lg:my-8" aria-labelledby="hours-title">
          <div data-slot="card-header">
            <h2 data-slot="card-title" id="hours-title" class="font-display font-normal text-2xl">Open this week</h2>
            <p data-slot="card-description" class="text-base">Appointments start on the half-hour. The last one ends at closing.</p>
          </div>
          <div class="px-6"><hr data-slot="separator"></div>
          <div data-slot="card-content">
            <table data-slot="table">
              <caption class="sr-only">Opening hours this week</caption>
              <thead class="sr-only"><tr><th scope="col">Day</th><th scope="col">Hours</th></tr></thead>
              <tbody id="hours">
                <tr><td><span data-slot="skeleton" class="block h-4 w-24" aria-hidden="true"></span></td><td data-align="end"><span data-slot="skeleton" class="inline-block h-4 w-24" aria-hidden="true"></span></td></tr>
                <tr><td><span data-slot="skeleton" class="block h-4 w-24" aria-hidden="true"></span></td><td data-align="end"><span data-slot="skeleton" class="inline-block h-4 w-24" aria-hidden="true"></span></td></tr>
                <tr><td><span data-slot="skeleton" class="block h-4 w-24" aria-hidden="true"></span></td><td data-align="end"><span data-slot="skeleton" class="inline-block h-4 w-24" aria-hidden="true"></span></td></tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div data-slot="alert" data-variant="destructive" role="alert" id="failure" hidden>
        <p data-slot="alert-title">The model could not answer</p>
        <p data-slot="alert-description" id="failure-text"></p>
      </div>

      <div class="grid gap-8 lg:grid-cols-5 items-start">
        <form data-slot="card" id="book" class="lg:col-span-3" aria-labelledby="book-title" novalidate autocomplete="off">
          <div data-slot="card-header">
            <h2 data-slot="card-title" id="book-title" class="font-display font-normal text-2xl">Book a visit</h2>
            <p data-slot="card-description" class="text-base">Four steps. The model checks each one.</p>
          </div>
          <div data-slot="card-content" class="grid gap-8">
            <ol data-slot="steps">
              <li data-slot="step" id="service-step">
                <h3 data-slot="step-title" id="service-title">Choose a service</h3>
                <div data-slot="field" id="service-field">
                  <div data-slot="choice-group" role="radiogroup" id="service" aria-labelledby="service-title" class="grid gap-3 sm:grid-cols-2">
                    <div data-slot="skeleton" class="h-16 w-full" aria-hidden="true"></div>
                    <div data-slot="skeleton" class="h-16 w-full" aria-hidden="true"></div>
                  </div>
                  <p data-slot="field-error" id="service-error" hidden></p>
                </div>
              </li>
              <li data-slot="step" id="stylist-step">
                <h3 data-slot="step-title" id="stylist-title">Choose a stylist</h3>
                <div data-slot="field" id="stylist-field">
                  <div data-slot="choice-group" role="radiogroup" id="stylist" aria-labelledby="stylist-title" class="grid gap-3 sm:grid-cols-3">
                    <div data-slot="skeleton" class="h-16 w-full" aria-hidden="true"></div>
                    <div data-slot="skeleton" class="h-16 w-full" aria-hidden="true"></div>
                  </div>
                  <p data-slot="field-error" id="stylist-error" hidden></p>
                </div>
              </li>
              <li data-slot="step" id="time-step">
                <h3 data-slot="step-title" id="day-title">Pick a day and time</h3>
                <div data-slot="field" id="day-field">
                  <div data-slot="choice-group" role="radiogroup" id="day" aria-labelledby="day-title" class="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div data-slot="skeleton" class="h-16 w-full" aria-hidden="true"></div>
                    <div data-slot="skeleton" class="h-16 w-full" aria-hidden="true"></div>
                  </div>
                  <p data-slot="field-error" id="day-error" hidden></p>
                </div>
                <div data-slot="field" id="time-field">
                  <p id="time-title" class="pt-2 text-sm font-medium">Free times</p>
                  <p class="text-sm text-muted-foreground" id="time-hint">Choose a service, a stylist and a day to see the free times.</p>
                  <div data-slot="choice-group" role="radiogroup" id="time" aria-labelledby="time-title" class="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6" hidden></div>
                  <div data-slot="empty" id="time-empty" hidden>
                    <div data-slot="empty-header">
                      <div data-slot="empty-icon" data-variant="icon"><span data-slot="icon" data-icon="calendar" aria-hidden="true"></span></div>
                      <h4 data-slot="empty-title" id="time-empty-title"></h4>
                      <p data-slot="empty-description" id="time-empty-text"></p>
                    </div>
                  </div>
                  <p data-slot="field-error" id="time-error" hidden></p>
                </div>
              </li>
              <li data-slot="step" id="details-step">
                <h3 data-slot="step-title">Your details</h3>
                <div data-slot="field-group">
                  <div data-slot="field" id="name-field">
                    <label data-slot="field-label" for="name">Name</label>
                    <input data-slot="input" id="name" name="name" placeholder="Maya Lind" autocomplete="off" aria-describedby="name-hint">
                    <p data-slot="field-description" id="name-hint">The name the booking is kept under.</p>
                    <p data-slot="field-error" id="name-error" hidden></p>
                  </div>
                </div>
              </li>
            </ol>
            <div data-slot="alert" data-variant="destructive" id="book-alert" hidden>
              <p data-slot="alert-title">Not booked</p>
              <p data-slot="alert-description" id="book-alert-text"></p>
            </div>
            <div data-slot="alert" data-variant="success" role="status" id="booked" hidden>
              <p data-slot="alert-title" id="booked-title"></p>
              <p data-slot="alert-description" id="booked-text"></p>
            </div>
          </div>
          <div data-slot="card-footer">
            <button data-slot="button" data-size="lg" type="submit" id="confirm" class="w-full">Confirm booking</button>
          </div>
        </form>

        <section data-slot="card" id="bookings" class="lg:col-span-2" aria-labelledby="bookings-title">
          <div data-slot="card-header">
            <h2 data-slot="card-title" id="bookings-title" class="font-display font-normal text-2xl">Your bookings</h2>
            <p data-slot="card-description" class="text-base" id="bookings-description">This week</p>
          </div>
          <div data-slot="card-content">
            <ul data-slot="item-group" id="booking-list" class="list-none gap-3" aria-labelledby="bookings-title" hidden></ul>
            <div data-slot="empty" id="bookings-empty" hidden>
              <div data-slot="empty-header">
                <div data-slot="empty-icon" data-variant="icon"><span data-slot="icon" data-icon="calendar" aria-hidden="true"></span></div>
                <h3 data-slot="empty-title">No bookings yet</h3>
                <p data-slot="empty-description">Book a visit and it appears here.</p>
              </div>
              <div data-slot="empty-content"><a data-slot="button" data-variant="outline" href="#book" data-go="book">Book a visit</a></div>
            </div>
            <div class="grid gap-3" id="bookings-loading">
              <div data-slot="skeleton" class="h-12 w-full" aria-hidden="true"></div>
              <div data-slot="skeleton" class="h-12 w-full" aria-hidden="true"></div>
            </div>
          </div>
        </section>
      </div>

      <aside data-slot="tip">
        <span data-slot="icon" data-icon="shield-check" aria-hidden="true"></span>
        <strong>Proved</strong>
        <p>No two bookings of one stylist can share a half-hour. Lean's kernel checked the rule; this page only shows what the model answers.</p>
      </aside>
    </main>
  </div>

  <dialog data-slot="dialog" id="cancel-dialog" aria-labelledby="cancel-title">
    <div data-slot="dialog-header">
      <h2 data-slot="dialog-title" id="cancel-title">Cancel this booking?</h2>
      <p data-slot="dialog-description" id="cancel-text"></p>
    </div>
    <div data-slot="dialog-footer">
      <button data-slot="button" data-variant="outline" type="button" data-close>Keep it</button>
      <button data-slot="button" data-variant="destructive" type="button" id="cancel-confirm">Cancel booking</button>
    </div>
  </dialog>
</body>
</html>
```
