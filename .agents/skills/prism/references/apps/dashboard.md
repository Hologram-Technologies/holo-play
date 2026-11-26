# Reference app: dashboard

Written by scripts/design-reference.mjs from examples/design/ in the PrismPM repository. Imitate its structure; take the model's protocol from your own model.

Aster, a sales pipeline dashboard. It is the design system's reference for a dashboard: a sidebar, section cards, a chart, tables and forms, on a model that keeps state. The model decides every figure, every move and every refusal. The page sends a command with the state the model last answered, then draws what comes back.

```bash
node examples/design/build.mjs dashboard <out-dir>   # init, lay these files over it, lock, check, build, verify
```

This folder holds only the files that differ from a fresh `prism-code init`: the model (`app/src/App.lex.tex`), the page (`app/view/`), the look (`app/design/theme.json`, `app/DESIGN.md`), the ledgers (`model/ids.toml`, `features/suites/app.feature`), the `CONFORMANCE.md` the build generates from them, and `prism.toml`.

## app/DESIGN.md

```markdown
# Aster's look

Aster uses the design system's `noir` preset (`design/theme.json`), with no roles changed.

- **Colour:** near-black ground, cream ink, and one gold accent. The gold is kept for the charts, the proposal dot and the tip's icon.
- **Type:** the brand's display face for the wordmark and the page titles; tabular figures for money.
- **Light and dark:** the preset is dark in both, and in immersive the ground lets the frame show through.

The layout is shadcn/ui's dashboard block, in the catalogue's shadcn components:

- a sidebar with the wordmark, the one filled button (Add deal) and a menu of three sections;
- a page header: an eyebrow, the title in the display face, and one line;
- four section cards, each a label, a large figure, a badge saying how the last request moved it, a sparkline and two lines of footer;
- a chart card whose toggle group chooses the series;
- tables in a container with a muted head, and a dot beside each stage, never a coloured pill;
- one icon per meaning (the wordmark, the three sections, the trend in a badge, search, add, restore, proved), never decoration.
```

## app/design/theme.json

```json
{"schema":"prism/theme/1","preset":"noir"}
```

## app/view/app.js

```js
// Aster, the sales dashboard's page. The model decides every figure, every move and every refusal; this file sends
// it a command with the state it last answered, and shows what comes back. No rule lives here (R1).
//
// The protocol, one request and one answer, both plain text:
//   request  <command>\n<state>
//   command  show | add <owner> <value> <name> | move <n> <stage> | target <value> | filter <stage|all> <owner|all> | trend
//   state    <target>, then one line per deal, oldest first: <stage> <owner> <value> <name>
//   answer   to show, add, move and target, three parts:
//              ok <met|short> target=<t> pipeline=<p> revenue=<r> rate=<%> gap=<g> open=<n> closed=<n> lead=<n>:<v> … lost=<n>:<v>
//              change pipeline=<up|down|flat>:<by> revenue=… rate=… gap=…
//              <the next state>
//            to filter:  ok filter count=<n> value=<v>\n<one 1 or 0 per deal>
//            to trend:   ok trend, then one line per deal and one before the first: <pipeline> <revenue> <rate> <gap>
//            or one refusal sentence, and then the state is unchanged.
const { invoke } = globalThis.prism;
const { ui } = globalThis;
const { h } = ui;

const $ = (id) => document.getElementById(id);
const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const money = (units) => dollars.format(units);
const percent = (n) => `${n}%`;
const plural = (n, one, many) => (n === 1 ? one : many);
const KEY = 'prism-dashboard-state';
const VIEWS = { overview: 'Overview', deals: 'Deals', settings: 'Settings' };
// How the page words and colours what the model names. The names are the model's; the order is the pipeline's.
const STAGES = { lead: ['Lead', 'default'], qualified: ['Qualified', 'default'], proposal: ['Proposal', 'warning'], won: ['Won', 'success'], lost: ['Lost', 'destructive'] };
const OWNERS = { ana: 'Ana Ruiz', ben: 'Ben Okafor', cleo: 'Cleo Marchetti', dev: 'Dev Patel' };

// The first state: the sample pipeline. It is data, not a rule; the model checks it like any other state.
const SEED = [
  '150000',
  'won ana 48000 Northwind renewal',
  'won ben 36000 Halcyon rollout',
  'lost cleo 22000 Verdant pilot',
  'proposal ana 42000 Acme expansion',
  'proposal dev 27500 Lumen analytics',
  'qualified ben 31000 Orbit onboarding',
  'qualified cleo 18500 Pinecrest seats',
  'lead dev 12000 Juniper trial',
  'lead ana 64000 Atlas platform',
  'won cleo 39000 Kestrel upgrade',
  'lost dev 16000 Quarry audit',
  'lead ben 9500 Fable starter',
].join('\n');

// Which control a refusal belongs to: the model's registered refusal sentences, matched exactly.
const FIELD_OF = {
  'A deal is worth more than zero.': 'deal-value',
  'Write a whole number, like 12000.': 'deal-value',
  'Keep it under a billion.': 'deal-value',
  'Unknown owner: choose ana, ben, cleo or dev.': 'deal-owner',
  'A deal needs a name.': 'deal-name',
  'The name is too long: keep it to 24 bytes.': 'deal-name',
};

let state = SEED; // the model's last state, sent back with every request
let figures = null; // the model's last figures and how they changed
let series = []; // the model's figures after each deal
let match = { count: 0, value: 0, mask: '' }; // the model's answer to the filter
let charted = 'revenue'; // the figure the chart card draws

const remember = (text) => { try { localStorage.setItem(KEY, text); } catch { /* storage is optional */ } };
const recall = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const request = (command) => invoke(`${command}\n${state}`);

// Ask the model for a change. An `ok` answer moves the page to its state and redraws; a refusal comes back as words.
async function ask(command) {
  const answer = await request(command);
  if (!answer.startsWith('ok ')) return { refusal: answer };
  const first = answer.indexOf('\n');
  const second = answer.indexOf('\n', first + 1);
  state = answer.slice(second + 1);
  remember(state);
  figures = readFigures(answer.slice(0, first), answer.slice(first + 1, second));
  await follow();
  draw();
  return { ok: true };
}

// The two questions that follow every state: the figures deal by deal, and which deals the filter shows.
async function follow() {
  const trend = await request('trend');
  if (!trend.startsWith('ok trend')) throw new Error(trend);
  series = trend.split('\n').slice(1).map((line) => {
    const [pipeline, revenue, rate, gap] = line.split(' ').map(Number);
    return { pipeline, revenue, rate, gap };
  });
  await refilter();
}
async function refilter() {
  const answer = await request(`filter ${$('filter-stage').value} ${$('filter-owner').value}`);
  if (!answer.startsWith('ok filter')) throw new Error(answer);
  const [head, mask = ''] = answer.split('\n');
  const words = Object.fromEntries(head.split(' ').slice(2).map((w) => w.split('=')));
  match = { count: Number(words.count), value: Number(words.value), mask };
}

function readFigures(summary, change) {
  const words = summary.split(' ');
  const f = { met: words[1] === 'met', stages: {}, change: {} };
  for (const word of words.slice(2)) {
    const [key, value] = word.split('=');
    if (value.includes(':')) {
      const [count, worth] = value.split(':').map(Number);
      f.stages[key] = { count, worth };
    } else f[key] = Number(value);
  }
  for (const word of change.split(' ').slice(1)) {
    const [key, value] = word.split('=');
    const [trend, by] = value.split(':');
    f.change[key] = { trend, by: Number(by) };
  }
  return f;
}

const deals = () => state.split('\n').slice(1).map((line, i) => {
  const [stage, owner, value, ...name] = line.split(' ');
  return { n: i + 1, stage, owner, value: Number(value), name: name.join(' ') };
});

// A section card's badge: how the last request moved the figure, as the model answered it.
function changed(id, change, amount) {
  const badge = $(id);
  const [icon, words] = badge.children;
  if (change.trend === 'up') icon.setAttribute('data-icon', 'trending-up');
  else if (change.trend === 'down') icon.setAttribute('data-icon', 'trending-down');
  else icon.setAttribute('data-icon', 'minus');
  words.textContent = change.trend === 'flat' ? 'Steady' : `${change.trend === 'up' ? '+' : '−'}${amount}`;
  badge.dataset.tooltip = change.trend === 'flat' ? 'The last request did not change it' : `${change.trend === 'up' ? 'Up' : 'Down'} ${amount} with the last request`;
  badge.hidden = false;
}
function spark(id, key, label, format) {
  const fig = $(id);
  fig.dataset.values = series.map((point, i) => `${i}:${point[key]}`).join(',');
  fig.setAttribute('aria-label', `${label} after each deal, oldest first: from ${format(series[0][key])} to ${format(series[series.length - 1][key])}`);
}

// The chart card: one of the model's series, chosen with the toggle group.
function drawChart() {
  const f = figures;
  const won = f.stages.won.count;
  const kinds = {
    revenue: ['Revenue', 'Won revenue', money, f.met ? `The ${money(f.target)} target is met` : `${money(f.gap)} short of the ${money(f.target)} target`],
    pipeline: ['Pipeline', 'Open pipeline', money, `${f.open} open ${plural(f.open, 'deal', 'deals')}, deal by deal`],
    rate: ['Win rate', 'Win rate', percent, `${won} won of ${f.closed} closed, deal by deal`],
  };
  const [title, label, format, description] = kinds[charted];
  const chart = $('trend-chart');
  if (charted === 'rate') {
    chart.removeAttribute('data-currency');
    chart.dataset.suffix = '%';
  } else {
    chart.removeAttribute('data-suffix');
    chart.dataset.currency = 'USD';
  }
  chart.dataset.values = series.map((point, i) => `${i === 0 ? 'Start' : i}:${point[charted]}`).join(',');
  chart.setAttribute('aria-label', `${label} after each deal, oldest first: ${format(series[0][charted])} at the start, ${format(series[series.length - 1][charted])} now`);
  // The catalogue's toggle draws no ground for the one that is on, so the page gives it one, in the system's words.
  for (const item of $('trend-toggle').children) item.classList.toggle('bg-primary/10', item.value === charted);
  $('trend-title').textContent = title;
  $('trend-description').textContent = description;
}
$('trend-toggle').addEventListener('ui:toggle', (event) => {
  if (!event.detail.on || !figures) return;
  charted = event.detail.value;
  drawChart();
});

function draw() {
  const f = figures;
  const won = f.stages.won.count;
  $('pipeline-value').textContent = money(f.pipeline);
  $('revenue-value').textContent = money(f.revenue);
  $('rate-value').textContent = percent(f.rate);
  $('gap-value').textContent = f.met ? 'Met' : money(f.gap);
  changed('pipeline-change', f.change.pipeline, money(f.change.pipeline.by));
  changed('revenue-change', f.change.revenue, money(f.change.revenue.by));
  changed('rate-change', f.change.rate, `${f.change.rate.by} ${plural(f.change.rate.by, 'pt', 'pts')}`);
  changed('gap-change', f.change.gap, money(f.change.gap.by));
  $('pipeline-line').textContent = `${f.open} open ${plural(f.open, 'deal', 'deals')}`;
  $('revenue-line').textContent = `${won} ${plural(won, 'deal', 'deals')} won`;
  $('rate-line').textContent = `${won} won of ${f.closed} closed`;
  $('gap-line').textContent = f.met ? `The ${money(f.target)} target is met` : `Of a ${money(f.target)} target`;
  spark('pipeline-spark', 'pipeline', 'Open pipeline', money);
  spark('revenue-spark', 'revenue', 'Won revenue', money);
  spark('rate-spark', 'rate', 'Win rate', percent);
  spark('gap-spark', 'gap', 'Left to the target', money);
  drawChart();

  $('stage-rows').replaceChildren(...Object.entries(STAGES).map(([key, [label, tone]]) => h('tr', null,
    h('td', null, h('span', { slot: 'status', tone }, label)),
    h('td', { 'data-align': 'end', class: 'tabular-nums' }, String(f.stages[key].count)),
    h('td', { 'data-align': 'end', class: 'tabular-nums' }, money(f.stages[key].worth)))));
  $('stages-description').textContent = `${f.open} open and ${f.closed} closed`;

  if (document.activeElement !== $('target')) $('target').value = String(f.target);
  drawRows();
  $('main').removeAttribute('aria-busy');
}

// The deals table: the rows the model's filter shows, narrowed by the words typed in the search box.
function drawRows() {
  const typed = $('search').value.trim();
  const all = deals();
  const shown = all.filter((deal, i) => match.mask[i] === '1' && deal.name.toLowerCase().includes(typed.toLowerCase()));
  $('rows').replaceChildren(...shown.map((deal) => {
    const [label, tone] = STAGES[deal.stage];
    const select = h('select', { slot: 'native-select', 'aria-label': `Move ${deal.name} to a stage`, 'data-move': String(deal.n) },
      h('option', { value: '' }, 'Move to…'), ...Object.entries(STAGES).map(([key, [word]]) => h('option', { value: key }, word)));
    select.addEventListener('change', () => move(deal, select));
    const chevron = h('span', { slot: 'icon' });
    chevron.setAttribute('data-icon', 'chevron-down');
    return h('tr', null,
      h('td', { class: 'font-medium' }, deal.name),
      h('td', null, h('span', { class: 'flex items-center gap-2 whitespace-nowrap' }, h('span', { slot: 'avatar', size: 'sm', 'data-name': OWNERS[deal.owner], 'aria-hidden': 'true' }), OWNERS[deal.owner])),
      h('td', null, h('span', { slot: 'status', tone }, label)),
      h('td', { 'data-align': 'end', class: 'tabular-nums' }, money(deal.value)),
      h('td', null, h('div', { slot: 'native-select-wrapper' }, select, h('span', { slot: 'native-select-icon', 'aria-hidden': 'true' }, chevron))));
  }));
  const filtered = $('filter-stage').value !== 'all' || $('filter-owner').value !== 'all';
  $('table-box').hidden = shown.length === 0;
  $('list-empty').hidden = shown.length !== 0;
  $('empty-title').textContent = all.length === 0 ? 'No deals yet' : 'No deals match';
  $('empty-text').textContent = all.length === 0 ? 'Add the first deal and the model keeps the figures.' : 'Nothing in the pipeline fits this search and these filters.';
  $('clear-filters').hidden = all.length === 0;
  const counted = `${match.count} ${plural(match.count, 'deal', 'deals')} worth ${money(match.value)}${filtered ? ' in this filter' : ''}`;
  $('list-description').textContent = typed ? `${counted}; ${shown.length} named like “${typed}”.` : `${counted}, oldest first.`;
}

function failed(error) {
  $('failure-text').textContent = error && error.message ? error.message : String(error);
  $('failure').hidden = false;
  $('main').removeAttribute('aria-busy');
}
async function busy(control, work) {
  control.disabled = true;
  control.setAttribute('aria-busy', 'true');
  try {
    return await work();
  } catch (error) {
    failed(error);
    return null;
  } finally {
    control.disabled = false;
    control.removeAttribute('aria-busy');
  }
}

// Field errors: the model's own words under the control they concern, cleared on the next try.
function showError(name, words) {
  $(`${name}-field`).setAttribute('data-invalid', 'true');
  $(name).setAttribute('aria-invalid', 'true');
  $(name).setAttribute('aria-describedby', `${name}-error`);
  const error = $(`${name}-error`);
  error.textContent = words;
  error.setAttribute('role', 'alert');
  error.hidden = false;
}
function clearError(name) {
  if (!$(`${name}-field`).hasAttribute('data-invalid')) return;
  $(`${name}-field`).removeAttribute('data-invalid');
  $(name).removeAttribute('aria-invalid');
  if ($(`${name}-hint`)) $(name).setAttribute('aria-describedby', `${name}-hint`); else $(name).removeAttribute('aria-describedby');
  $(`${name}-error`).hidden = true;
}
for (const name of ['deal-name', 'deal-owner', 'deal-value', 'target']) $(name).addEventListener('input', () => clearError(name));

// The three views, switched in the page.
function show(view) {
  for (const name of Object.keys(VIEWS)) $(`view-${name}`).hidden = name !== view;
  for (const button of document.querySelectorAll('[data-view]')) {
    if (button.dataset.view === view) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  }
  document.title = `${VIEWS[view]} · Aster`;
}
for (const button of document.querySelectorAll('[data-view]')) button.addEventListener('click', () => show(button.dataset.view));
$('view-all').addEventListener('click', () => show('deals'));

// Move a deal: the model answers the next state, or says by name why the move is not allowed.
async function move(deal, select) {
  const goal = select.value;
  if (!goal) return;
  $('move-alert').hidden = true;
  const result = await busy(select, () => ask(`move ${deal.n} ${goal}`));
  select.value = '';
  if (!result) return;
  if (result.refusal) {
    $('move-alert-text').textContent = `${deal.name}: ${result.refusal}`;
    $('move-alert').hidden = false;
    select.focus();
    return;
  }
  ui.toast(`${deal.name} moved to ${STAGES[goal][0].toLowerCase()}`, { variant: 'success' });
  const again = document.querySelector(`[data-move="${deal.n}"]`);
  if (again) again.focus();
}

// Search narrows the rows by name; the stage and owner filters are questions to the model.
async function filterAgain() {
  try {
    await refilter();
    drawRows();
  } catch (error) {
    failed(error);
  }
}
$('search').addEventListener('input', drawRows);
$('filter-stage').addEventListener('change', filterAgain);
$('filter-owner').addEventListener('change', filterAgain);
$('clear-filters').addEventListener('click', () => {
  $('search').value = '';
  $('filter-stage').value = 'all';
  $('filter-owner').value = 'all';
  filterAgain();
});
document.addEventListener('keydown', (event) => {
  if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || document.querySelector('dialog[open]')) return;
  if (event.target instanceof HTMLElement && event.target.matches('input, select, textarea')) return;
  event.preventDefault();
  show('deals');
  $('search').focus();
});

// Add a deal, in the dialog.
const ADD_FIELDS = ['deal-name', 'deal-owner', 'deal-value'];
for (const opener of document.querySelectorAll('[data-open=add-dialog]')) {
  opener.addEventListener('click', () => {
    for (const name of ADD_FIELDS) clearError(name);
    $('add-alert').hidden = true;
  });
}
$('add-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('add-button');
  if (button.disabled) return;
  for (const name of ADD_FIELDS) clearError(name);
  $('add-alert').hidden = true;
  const name = $('deal-name').value.trim().replace(/\s+/g, ' ');
  const value = $('deal-value').value.replace(/\s+/g, '');
  const result = await busy(button, () => ask(`add ${$('deal-owner').value} ${value} ${name}`));
  if (!result) return;
  if (result.refusal) {
    const field = FIELD_OF[result.refusal];
    if (field) {
      showError(field, result.refusal);
      $(field).focus();
    } else {
      $('add-alert-text').textContent = result.refusal;
      $('add-alert').hidden = false;
    }
    return;
  }
  $('add-dialog').close();
  $('add-form').reset();
  ui.toast(`${name} added as a lead`, { variant: 'success' });
});

// Save the target, through the model.
$('target-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('target-save');
  if (button.disabled) return;
  clearError('target');
  const result = await busy(button, () => ask(`target ${$('target').value.replace(/\s+/g, '')}`));
  if (!result) return;
  if (result.refusal) {
    showError('target', result.refusal);
    return;
  }
  $('target').value = String(figures.target);
  ui.toast(`Target saved: ${money(figures.target)}`, { variant: 'success' });
});

// Start again from the sample.
$('restore-confirm').addEventListener('click', async () => {
  const kept = state;
  state = SEED;
  const result = await busy($('restore-confirm'), () => ask('show'));
  $('restore-dialog').close();
  if (!result || result.refusal) {
    state = kept;
    if (result) failed(new Error(result.refusal));
    return;
  }
  ui.toast('Sample pipeline restored', { variant: 'success' });
});

// The eyebrow names the month the person is in; the model keeps no calendar.
$('month').textContent = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date());

// The first answer: the pipeline this browser kept, if the model accepts it, or the sample.
(async () => {
  try {
    const kept = recall();
    if (kept) {
      state = kept;
      if ((await ask('show')).ok) return;
    }
    state = SEED;
    const result = await ask('show');
    if (result.refusal) throw new Error(result.refusal);
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
  <title>Aster</title>
  <!--
    Aster, the sales dashboard reference app, built from the Prism design system with the noir preset (app/DESIGN.md).
    The layout follows shadcn/ui's dashboard block: a sidebar menu, section cards, a chart card with a toggle group, and
    a table in a container. The model (app/src/App.lex.tex) decides every figure, every move and every refusal;
    this page sends a command with the state the model last answered, and shows the answer.
  -->
  <link rel="icon" href="data:,">
  <link rel="stylesheet" href="prism.css">
  <script src="prism-ui.js"></script>
  <script type="module" src="prism.js"></script>
  <script type="module" src="app.js"></script>
</head>
<body>
  <div data-slot="app">
    <div data-slot="split">
      <nav data-slot="sidebar" aria-label="Sections">
        <div data-slot="sidebar-header">
          <div data-slot="brand">
            <span data-slot="brand-mark" aria-hidden="true"><span data-slot="icon" data-icon="sparkles"></span></span>
            <span data-slot="brand-name">Aster</span>
          </div>
        </div>
        <div data-slot="sidebar-content">
          <div data-slot="sidebar-group">
            <div data-slot="sidebar-group-content" class="flex flex-col gap-2">
              <button data-slot="button" type="button" class="w-full justify-start" data-open="add-dialog"><span data-slot="icon" data-icon="plus" aria-hidden="true"></span>Add deal</button>
              <ul data-slot="sidebar-menu" class="flex-row md:flex-col">
                <li data-slot="sidebar-menu-item" class="flex-1 md:flex-none"><button data-slot="sidebar-menu-button" type="button" data-view="overview" aria-current="page"><span data-slot="icon" data-icon="layout-dashboard" aria-hidden="true"></span><span>Overview</span></button></li>
                <li data-slot="sidebar-menu-item" class="flex-1 md:flex-none"><button data-slot="sidebar-menu-button" type="button" data-view="deals"><span data-slot="icon" data-icon="briefcase" aria-hidden="true"></span><span>Deals</span></button></li>
                <li data-slot="sidebar-menu-item" class="flex-1 md:flex-none"><button data-slot="sidebar-menu-button" type="button" data-view="settings"><span data-slot="icon" data-icon="settings" aria-hidden="true"></span><span>Settings</span></button></li>
              </ul>
            </div>
          </div>
        </div>
      </nav>

      <main id="main" class="flex flex-col min-w-0 gap-4 px-4 pb-12 lg:px-6" aria-busy="true">
        <div data-slot="alert" data-variant="destructive" role="alert" id="failure" class="mt-6" hidden>
          <p data-slot="alert-title">The model could not answer</p>
          <p data-slot="alert-description" id="failure-text"></p>
        </div>

        <!-- Overview: the figures the model answers. -->
        <section id="view-overview" class="flex flex-col gap-4" aria-labelledby="overview-title">
          <div class="flex items-end justify-between gap-4 flex-wrap">
            <header data-slot="page-header" class="pb-2">
              <p data-slot="eyebrow" id="month">This month</p>
              <h1 id="overview-title">Overview</h1>
              <p>The pipeline, the revenue won and the month's target.</p>
            </header>
            <div class="flex items-center gap-3 pb-2">
              <span data-slot="badge" data-variant="outline" data-tooltip="Every figure is computed by the app's model, whose rules Lean's kernel proved" tabindex="0"><span data-slot="icon" data-icon="shield-check" aria-hidden="true"></span>Proved model</span>
            </div>
          </div>

          <section class="grid gap-4 md:grid-cols-2 lg:grid-cols-4" aria-label="Key figures">
            <div data-slot="card">
              <div data-slot="card-header">
                <div data-slot="card-description">Open pipeline</div>
                <div data-slot="card-title" class="text-2xl font-semibold tabular-nums" id="pipeline-value"><span data-slot="skeleton" class="block h-8 w-32" aria-hidden="true"></span></div>
                <div data-slot="card-action"><span data-slot="badge" data-variant="outline" id="pipeline-change" tabindex="0" hidden><span data-slot="icon" data-icon="minus" aria-hidden="true"></span><span></span></span></div>
              </div>
              <div data-slot="card-content"><figure data-slot="chart" data-type="spark" data-values="" id="pipeline-spark" aria-label="Open pipeline after each deal"></figure></div>
              <div data-slot="card-footer" class="flex-col items-start gap-1 text-sm"><div class="font-medium" id="pipeline-line">Open deals</div><div class="text-muted-foreground">Lead, qualified and proposal</div></div>
            </div>
            <div data-slot="card">
              <div data-slot="card-header">
                <div data-slot="card-description">Won revenue</div>
                <div data-slot="card-title" class="text-2xl font-semibold tabular-nums" id="revenue-value"><span data-slot="skeleton" class="block h-8 w-32" aria-hidden="true"></span></div>
                <div data-slot="card-action"><span data-slot="badge" data-variant="outline" id="revenue-change" tabindex="0" hidden><span data-slot="icon" data-icon="minus" aria-hidden="true"></span><span></span></span></div>
              </div>
              <div data-slot="card-content"><figure data-slot="chart" data-type="spark" data-values="" id="revenue-spark" aria-label="Won revenue after each deal"></figure></div>
              <div data-slot="card-footer" class="flex-col items-start gap-1 text-sm"><div class="font-medium" id="revenue-line">Deals won</div><div class="text-muted-foreground">It never falls: a won deal stays won</div></div>
            </div>
            <div data-slot="card">
              <div data-slot="card-header">
                <div data-slot="card-description">Win rate</div>
                <div data-slot="card-title" class="text-2xl font-semibold tabular-nums" id="rate-value"><span data-slot="skeleton" class="block h-8 w-20" aria-hidden="true"></span></div>
                <div data-slot="card-action"><span data-slot="badge" data-variant="outline" id="rate-change" tabindex="0" hidden><span data-slot="icon" data-icon="minus" aria-hidden="true"></span><span></span></span></div>
              </div>
              <div data-slot="card-content"><figure data-slot="chart" data-type="spark" data-values="" id="rate-spark" aria-label="Win rate after each deal"></figure></div>
              <div data-slot="card-footer" class="flex-col items-start gap-1 text-sm"><div class="font-medium" id="rate-line">Won of closed</div><div class="text-muted-foreground">Won deals over closed deals</div></div>
            </div>
            <div data-slot="card">
              <div data-slot="card-header">
                <div data-slot="card-description">To target</div>
                <div data-slot="card-title" class="text-2xl font-semibold tabular-nums" id="gap-value"><span data-slot="skeleton" class="block h-8 w-32" aria-hidden="true"></span></div>
                <div data-slot="card-action"><span data-slot="badge" data-variant="outline" id="gap-change" tabindex="0" hidden><span data-slot="icon" data-icon="minus" aria-hidden="true"></span><span></span></span></div>
              </div>
              <div data-slot="card-content"><figure data-slot="chart" data-type="spark" data-values="" id="gap-spark" aria-label="Left to the target after each deal"></figure></div>
              <div data-slot="card-footer" class="flex-col items-start gap-1 text-sm"><div class="font-medium" id="gap-line">Of the monthly target</div><div class="text-muted-foreground">Revenue still to win this month</div></div>
            </div>
          </section>

          <section data-slot="card" aria-labelledby="trend-title">
            <div data-slot="card-header" class="flex flex-col md:grid">
              <h2 data-slot="card-title" id="trend-title">Revenue</h2>
              <div data-slot="card-description" id="trend-description">Deal by deal, oldest first</div>
              <div data-slot="card-action">
                <div data-slot="toggle-group" data-variant="outline" role="group" aria-label="Figure to chart" id="trend-toggle">
                  <button data-slot="toggle-group-item" data-variant="outline" data-state="on" aria-pressed="true" type="button" value="revenue">Revenue</button>
                  <button data-slot="toggle-group-item" data-variant="outline" type="button" value="pipeline">Pipeline</button>
                  <button data-slot="toggle-group-item" data-variant="outline" type="button" value="rate">Win rate</button>
                </div>
              </div>
            </div>
            <div data-slot="card-content"><figure data-slot="chart" data-type="line" data-currency="USD" data-values="" id="trend-chart" aria-label="Won revenue after each deal"></figure></div>
          </section>

          <section class="flex flex-col gap-3" aria-labelledby="stages-title">
            <div class="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h2 class="text-base font-semibold" id="stages-title">Pipeline by stage</h2>
                <p class="text-sm text-muted-foreground" id="stages-description">Deals and their value in each stage</p>
              </div>
              <button data-slot="button" data-variant="outline" data-size="sm" type="button" id="view-all">View all deals<span data-slot="icon" data-icon="arrow-right" aria-hidden="true"></span></button>
            </div>
            <div data-slot="table-container" class="rounded-lg border">
              <table data-slot="table" aria-labelledby="stages-title">
                <thead class="bg-muted"><tr><th scope="col">Stage</th><th scope="col" data-align="end">Deals</th><th scope="col" data-align="end">Value</th></tr></thead>
                <tbody id="stage-rows"></tbody>
              </table>
            </div>
          </section>

          <aside data-slot="tip"><span data-slot="icon" data-icon="shield-check" aria-hidden="true"></span><strong>Proved</strong><p>Won revenue never falls, and a closed deal never moves: Lean's kernel proved both of the model.</p></aside>
        </section>

        <!-- Deals: every deal, searched, filtered and moved. -->
        <section id="view-deals" class="flex flex-col gap-4" aria-labelledby="deals-title" hidden>
          <header data-slot="page-header" class="pb-2">
            <p data-slot="eyebrow">Pipeline</p>
            <h1 id="deals-title">Deals</h1>
            <p id="list-description" aria-live="polite">Every deal, its owner and its stage.</p>
          </header>

          <div class="grid gap-3 md:grid-cols-4">
            <div data-slot="input-group" class="md:col-span-2">
              <input data-slot="input-group-control" id="search" type="search" aria-label="Search deals by name" placeholder="Search deals…" autocomplete="off">
              <div data-slot="input-group-addon"><span data-slot="icon" data-icon="search" aria-hidden="true"></span></div>
              <div data-slot="input-group-addon" data-align="inline-end"><kbd data-slot="kbd">/</kbd></div>
            </div>
            <div data-slot="native-select-wrapper" class="w-full">
              <select data-slot="native-select" id="filter-stage" aria-label="Stage">
                <option value="all">All stages</option><option value="lead">Lead</option><option value="qualified">Qualified</option><option value="proposal">Proposal</option><option value="won">Won</option><option value="lost">Lost</option>
              </select>
              <span data-slot="native-select-icon" aria-hidden="true"><span data-slot="icon" data-icon="chevron-down"></span></span>
            </div>
            <div data-slot="native-select-wrapper" class="w-full">
              <select data-slot="native-select" id="filter-owner" aria-label="Owner">
                <option value="all">All owners</option><option value="ana">Ana Ruiz</option><option value="ben">Ben Okafor</option><option value="cleo">Cleo Marchetti</option><option value="dev">Dev Patel</option>
              </select>
              <span data-slot="native-select-icon" aria-hidden="true"><span data-slot="icon" data-icon="chevron-down"></span></span>
            </div>
          </div>

          <div data-slot="alert" data-variant="destructive" role="alert" id="move-alert" hidden>
            <p data-slot="alert-title">The model refused the move</p>
            <p data-slot="alert-description" id="move-alert-text"></p>
          </div>

          <div data-slot="table-container" class="rounded-lg border" id="table-box">
            <table data-slot="table" aria-labelledby="deals-title">
              <thead class="bg-muted"><tr><th scope="col">Deal</th><th scope="col">Owner</th><th scope="col">Stage</th><th scope="col" data-align="end">Value</th><th scope="col">Move</th></tr></thead>
              <tbody id="rows"></tbody>
            </table>
          </div>

          <div data-slot="empty" class="border border-dashed" id="list-empty" hidden>
            <div data-slot="empty-header">
              <div data-slot="empty-icon" data-variant="icon"><span data-slot="icon" data-icon="search" aria-hidden="true"></span></div>
              <h2 data-slot="empty-title" id="empty-title">No deals match</h2>
              <div data-slot="empty-description" id="empty-text">Nothing in the pipeline fits this search and these filters.</div>
            </div>
            <div data-slot="empty-content"><button data-slot="button" data-variant="outline" type="button" id="clear-filters">Clear filters</button></div>
          </div>
        </section>

        <!-- Settings: the target, saved through the model. -->
        <section id="view-settings" class="flex flex-col gap-4" aria-labelledby="settings-title" hidden>
          <header data-slot="page-header" class="pb-2">
            <p data-slot="eyebrow">Workspace</p>
            <h1 id="settings-title">Settings</h1>
            <p>The monthly target the team sells towards.</p>
          </header>
          <div class="grid gap-4 lg:grid-cols-2 items-start">
            <form data-slot="card" id="target-form" aria-labelledby="target-title" novalidate autocomplete="off">
              <div data-slot="card-header">
                <h2 data-slot="card-title" id="target-title">Monthly target</h2>
                <p data-slot="card-description">Won revenue is measured against it.</p>
              </div>
              <div data-slot="card-content">
                <div data-slot="field" id="target-field">
                  <label data-slot="label" for="target">Target</label>
                  <div data-slot="input-group">
                    <input data-slot="input-group-control" id="target" inputmode="numeric" placeholder="150000" aria-describedby="target-hint">
                    <div data-slot="input-group-addon"><span data-slot="icon" data-icon="dollar-sign" aria-hidden="true"></span></div>
                  </div>
                  <p data-slot="field-description" id="target-hint">A whole number of dollars.</p>
                  <p data-slot="field-error" id="target-error" hidden></p>
                </div>
              </div>
              <div data-slot="card-footer"><button data-slot="button" type="submit" id="target-save">Save target</button></div>
            </form>
            <section data-slot="card" aria-labelledby="sample-title">
              <div data-slot="card-header">
                <h2 data-slot="card-title" id="sample-title">Sample pipeline</h2>
                <p data-slot="card-description">Twelve deals and a target, to explore the dashboard with.</p>
              </div>
              <div data-slot="card-footer"><button data-slot="button" data-variant="outline" type="button" data-open="restore-dialog"><span data-slot="icon" data-icon="rotate-ccw" aria-hidden="true"></span>Restore the sample</button></div>
            </section>
          </div>
        </section>
      </main>
    </div>
  </div>

  <dialog data-slot="dialog" id="add-dialog" aria-labelledby="add-title">
    <form id="add-form" class="grid gap-4" novalidate autocomplete="off">
      <div data-slot="dialog-header">
        <h2 data-slot="dialog-title" id="add-title">Add a deal</h2>
        <p data-slot="dialog-description">It joins the pipeline as a lead.</p>
      </div>
      <div data-slot="field" id="deal-name-field">
        <label data-slot="label" for="deal-name">Name</label>
        <input data-slot="input" id="deal-name" placeholder="Acme expansion">
        <p data-slot="field-error" id="deal-name-error" hidden></p>
      </div>
      <div class="grid gap-4 sm:grid-cols-2 items-start">
        <div data-slot="field" id="deal-owner-field">
          <label data-slot="label" for="deal-owner">Owner</label>
          <div data-slot="native-select-wrapper" class="w-full">
            <select data-slot="native-select" id="deal-owner">
              <option value="ana">Ana Ruiz</option><option value="ben">Ben Okafor</option><option value="cleo">Cleo Marchetti</option><option value="dev">Dev Patel</option>
            </select>
            <span data-slot="native-select-icon" aria-hidden="true"><span data-slot="icon" data-icon="chevron-down"></span></span>
          </div>
          <p data-slot="field-error" id="deal-owner-error" hidden></p>
        </div>
        <div data-slot="field" id="deal-value-field">
          <label data-slot="label" for="deal-value">Value</label>
          <div data-slot="input-group">
            <input data-slot="input-group-control" id="deal-value" inputmode="numeric" placeholder="12000">
            <div data-slot="input-group-addon"><span data-slot="icon" data-icon="dollar-sign" aria-hidden="true"></span></div>
          </div>
          <p data-slot="field-error" id="deal-value-error" hidden></p>
        </div>
      </div>
      <div data-slot="alert" data-variant="destructive" role="alert" id="add-alert" hidden>
        <p data-slot="alert-title">The model refused the deal</p>
        <p data-slot="alert-description" id="add-alert-text"></p>
      </div>
      <div data-slot="dialog-footer">
        <button data-slot="button" data-variant="outline" type="button" data-close>Cancel</button>
        <button data-slot="button" type="submit" id="add-button">Add deal</button>
      </div>
    </form>
  </dialog>

  <dialog data-slot="dialog" id="restore-dialog" aria-labelledby="restore-title">
    <div data-slot="dialog-header">
      <h2 data-slot="dialog-title" id="restore-title">Restore the sample pipeline?</h2>
      <p data-slot="dialog-description">Your deals and your target are replaced by the sample's.</p>
    </div>
    <div data-slot="dialog-footer">
      <button data-slot="button" data-variant="outline" type="button" data-close>Cancel</button>
      <button data-slot="button" type="button" id="restore-confirm">Restore</button>
    </div>
  </dialog>
</body>
</html>
```
