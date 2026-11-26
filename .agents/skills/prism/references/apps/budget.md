# Reference app: budget

Written by scripts/design-reference.mjs from examples/design/ in the PrismPM repository. Imitate its structure; take the model's protocol from your own model.

A month's budget with expenses in four categories. It is the design system's reference for a dashboard or form app. The model decides every figure and every refusal. The page sends a command with the state the model last answered, then draws what comes back.

```bash
node examples/design/build.mjs budget <out-dir>   # init, lay these files over it, lock, check, build, verify
```

This folder holds only the files that differ from a fresh `prism-code init`:

- the model, `app/src/App.lex.tex`;
- the page, `app/view/`;
- its look: `app/design/theme.json`, the `evergreen` preset, explained in `app/DESIGN.md`;
- the ledgers, `model/ids.toml` and `features/suites/app.feature`;
- the `CONFORMANCE.md` the build generates from them;
- `prism.toml`.

## app/DESIGN.md

```markdown
# Tally's look

Tally uses the design system's `evergreen` preset (`design/theme.json`), with no roles changed.

- **Colour:** warm paper, with one deep green as the accent.
- **Type:** a serif display face, which every system has, for the wordmark and the page title; a sans for everything else, figures included.
- **Light and dark:** both, from the preset.

The page follows the patterns of a calm money app:

- a named product with a wordmark;
- a page header: the month as an eyebrow, then the title in the display face;
- three figures with small-caps labels and tabular numbers;
- the categories as cards, not a menu;
- one icon per meaning (wallet, receipt, piggy bank, the four categories, add, remove), never decoration;
- generous space between the sections.
```

## app/design/theme.json

```json
{"schema":"prism/theme/1","preset":"evergreen"}
```

## app/view/app.js

```js
// The budget page. The model decides every figure and every refusal; this file sends it a command and the state it
// last answered, and shows what comes back. No rule lives here (R1).
//
// The protocol, one request and one answer, both plain text:
//   request  <command>\n<state>     command: show | add <euros> <category> [<description>] | remove <n> | budget <euros>
//   answer   ok <within|over> budget=<c> spent=<c> left=<c> over=<c> food=<c> home=<c> travel=<c> fun=<c>\n<state>
//            or one refusal sentence, and then the state is unchanged.
//   state    <budget cents>, then one line per expense: <cents> <category>[ <description>]
// A request with no state starts from the model's own first month.
const { invoke } = globalThis.prism;
const { ui } = globalThis;
const { h } = ui;

const $ = (id) => document.getElementById(id);
const euros = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' });
const money = (cents) => euros.format(cents / 100);
const NAMES = { food: 'Food', home: 'Home', travel: 'Travel', fun: 'Fun' };
const ICONS = { food: 'utensils', home: 'house', travel: 'plane', fun: 'sparkles' };
const KEY = 'prism-budget-state';

// Which control a refusal belongs to: the model's registered refusal sentences, matched exactly.
const FIELD_OF = {
  'An expense is more than zero.': 'amount',
  'Write it in euros, like 12.50.': 'amount',
  'Keep it under a million euros.': 'amount',
  'Unknown category: choose food, home, travel or fun.': 'category',
  'The description is too long.': 'description',
};

let state = null; // the model's last state, sent back with every request
let pending = 0; // the expense the remove dialog asks about

const remember = (text) => { try { localStorage.setItem(KEY, text); } catch { /* storage is optional */ } };
const recall = () => { try { return localStorage.getItem(KEY); } catch { return null; } };

// Ask the model. An `ok` answer moves the page to its state and redraws; a refusal comes back as { refusal }.
async function ask(command) {
  const answer = await invoke(state === null ? command : `${command}\n${state}`);
  if (!answer.startsWith('ok ')) return { refusal: answer };
  const cut = answer.indexOf('\n');
  state = answer.slice(cut + 1);
  remember(state);
  draw(answer.slice(0, cut));
  return { ok: true };
}

function draw(summary) {
  const words = summary.split(' ');
  const over = words[1] === 'over';
  const f = Object.fromEntries(words.slice(2).map((w) => { const [k, v] = w.split('='); return [k, Number(v)]; }));
  $('stat-budget').textContent = money(f.budget);
  $('stat-spent').textContent = money(f.spent);
  $('stat-left').textContent = money(over ? f.over : f.left);
  $('stat-left-label').textContent = over ? 'Over by' : 'Left';
  $('stat-left-note').textContent = over ? 'More than the budget allows' : 'Until the budget is spent';
  $('stat-left').classList.toggle('text-destructive', over);
  $('over-badge').hidden = !over;
  $('within-badge').hidden = over;
  const used = $('used');
  used.max = Math.max(f.budget, 1);
  used.value = Math.min(f.spent, f.budget);
  used.setAttribute('aria-valuetext', `${money(f.spent)} of ${money(f.budget)}`);

  const cats = ['food', 'home', 'travel', 'fun'];
  const chart = $('chart');
  chart.dataset.values = cats.map((c) => `${NAMES[c]}:${f[c] / 100}`).join(',');
  chart.setAttribute('aria-label', `Spending by category: ${cats.map((c) => `${NAMES[c]} ${money(f[c])}`).join(', ')}`);
  chart.hidden = f.spent === 0;
  $('chart-empty').hidden = f.spent !== 0;

  const lines = state.split('\n').slice(1);
  const rows = lines.map((line, i) => {
    const [cents, category, ...rest] = line.split(' ');
    const description = rest.join(' ');
    const label = description || NAMES[category];
    const remove = h('button', {
      slot: 'button', variant: 'ghost', size: 'icon', type: 'button', 'data-open': 'remove-dialog',
      'aria-label': `Remove ${label}, ${money(Number(cents))}`, 'data-tooltip': 'Remove',
      onclick: () => { pending = i + 1; $('remove-text').textContent = `${label}, ${money(Number(cents))} in ${NAMES[category].toLowerCase()}. The totals change at once.`; },
    });
    remove.append(h('span', { slot: 'icon', 'data-icon': 'trash-2', 'aria-hidden': 'true' }));
    // One shadcn item per expense: the category's icon, what it was and its category, then the amount and Remove.
    return h('div', { slot: 'item', role: 'listitem', 'data-size': 'sm' },
      h('div', { slot: 'item-media', 'data-variant': 'icon' }, h('span', { slot: 'icon', 'data-icon': ICONS[category], 'aria-hidden': 'true' })),
      h('div', { slot: 'item-content' },
        h('div', { slot: 'item-title', class: description ? '' : 'text-muted-foreground' }, description || 'No description'),
        h('p', { slot: 'item-description' }, NAMES[category])),
      h('div', { slot: 'item-actions' }, h('span', { class: 'font-medium tabular-nums' }, money(Number(cents))), remove));
  });
  $('rows').replaceChildren(...rows);
  $('rows').hidden = rows.length === 0;
  $('list-empty').hidden = rows.length !== 0;
  $('count-badge').textContent = rows.length === 1 ? '1 expense' : `${rows.length} expenses`;
  $('list-description').textContent = rows.length === 0 ? 'This month, oldest first' : `${rows.length} this month, oldest first`;
  $('main').removeAttribute('aria-busy');
}

// Field errors: show the model's own words under the control they concern, and clear them on the next try.
function showError(name, words) {
  const field = $(`${name}-field`);
  const control = $(name);
  const error = $(`${name}-error`);
  field.toggleAttribute('data-invalid', true);
  // A choice group is a fieldset: it names its error, and its radios stay as they are.
  if (control.tagName !== 'FIELDSET') control.setAttribute('aria-invalid', 'true');
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
  const hint = $(`${name}-hint`);
  if (hint) $(name).setAttribute('aria-describedby', `${name}-hint`); else $(name).removeAttribute('aria-describedby');
  $(`${name}-error`).hidden = true;
}
for (const name of ['amount', 'category', 'description', 'budget']) $(name).addEventListener('input', () => clearError(name));

function failed(error) {
  $('failure-text').textContent = error && error.message ? error.message : String(error);
  $('failure').hidden = false;
}

async function busy(button, work) {
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  try { return await work(); } catch (error) { failed(error); return null; } finally { button.disabled = false; button.removeAttribute('aria-busy'); }
}

// Add an expense.
$('add-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('add-button');
  if (button.disabled) return;
  for (const name of ['amount', 'category', 'description']) clearError(name);
  $('add-alert').hidden = true;
  const amount = $('amount').value.trim();
  const category = document.querySelector('input[name=category]:checked').value;
  const description = $('description').value.trim();
  const result = await busy(button, () => ask(`add ${amount} ${category}${description ? ` ${description}` : ''}`));
  if (!result) return;
  if (result.refusal) {
    const field = FIELD_OF[result.refusal];
    if (field) showError(field, result.refusal);
    else { $('add-alert-text').textContent = result.refusal; $('add-alert').hidden = false; }
    return;
  }
  ui.toast(`Added ${description || NAMES[category]}`, { variant: 'success' });
  $('amount').value = '';
  $('description').value = '';
  $('amount').focus();
});

// The eyebrow names the month the person is in; the model keeps no calendar.
$('month').textContent = new Intl.DateTimeFormat('en-IE', { month: 'long', year: 'numeric' }).format(new Date());

$('start').addEventListener('click', () => $('amount').focus());

// Remove an expense, after the dialog confirms it.
$('remove-confirm').addEventListener('click', async () => {
  const button = $('remove-confirm');
  const result = await busy(button, () => ask(`remove ${pending}`));
  $('remove-dialog').close();
  if (!result) return;
  if (result.refusal) ui.toast(result.refusal, { variant: 'destructive' });
  else ui.toast('Expense removed');
});

// Set the budget.
$('open-budget').addEventListener('click', () => {
  clearError('budget');
  const cents = Number(state ? state.split('\n')[0] : 0);
  $('budget').value = cents ? String(cents / 100) : '';
});
$('budget-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('budget-save');
  clearError('budget');
  const result = await busy(button, () => ask(`budget ${$('budget').value.trim()}`));
  if (!result) return;
  if (result.refusal) { showError('budget', result.refusal); return; }
  $('budget-dialog').close();
  ui.toast(`Budget set to ${$('stat-budget').textContent}`, { variant: 'success' });
});

// The first answer: the month this browser kept, if the model accepts it, or the model's own first month.
(async () => {
  try {
    const kept = recall();
    if (kept) {
      state = kept;
      const result = await ask('show');
      if (result.ok) return;
    }
    state = null;
    await ask('show');
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
  <title>Tally</title>
  <!--
    Tally, the budget reference app, built from the Prism design system with the evergreen preset (app/DESIGN.md).
    The model (app/src/App.lex.tex) decides every figure and every refusal; this page sends a command and the
    state the model last answered, and shows the answer.
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
        <span data-slot="brand-mark" aria-hidden="true"><span data-slot="icon" data-icon="wallet"></span></span>
        <span data-slot="brand-name">Tally</span>
      </div>
      <span data-slot="badge" data-variant="outline" class="hidden sm:inline-flex gap-1" data-tooltip="Every figure is computed by the app's model, whose rules Lean's kernel proved" tabindex="0"><span data-slot="icon" data-icon="shield-check" aria-hidden="true"></span>Proved model</span>
    </header>

    <main id="main" class="flex-1 w-full max-w-6xl mx-auto px-4 pb-12 sm:px-8 flex flex-col gap-6" aria-busy="true">
      <div class="flex flex-wrap items-end justify-between gap-x-6">
        <header data-slot="page-header">
          <p data-slot="eyebrow" id="month">This month</p>
          <h1>Where the money goes</h1>
          <p>Your budget and what you spend, in four categories. Every figure comes from a proved model.</p>
        </header>
        <div class="flex items-center gap-3 pb-6">
          <button data-slot="button" data-variant="outline" type="button" id="open-budget" data-open="budget-dialog"><span data-slot="icon" data-icon="pencil" aria-hidden="true"></span>Set budget</button>
        </div>
      </div>

      <div data-slot="alert" data-variant="destructive" role="alert" id="failure" hidden>
        <p data-slot="alert-title">The model could not answer</p>
        <p data-slot="alert-description" id="failure-text"></p>
      </div>

      <section class="grid gap-4 sm:grid-cols-3" aria-label="This month">
        <div data-slot="card">
          <div data-slot="card-header">
            <p data-slot="card-description" class="flex items-center gap-2"><span data-slot="icon" data-icon="wallet" aria-hidden="true"></span>Budget</p>
            <div data-slot="card-title" id="stat-budget" class="text-3xl font-semibold tabular-nums"><span data-slot="skeleton" class="block h-8 w-32" aria-hidden="true"></span></div>
            <div data-slot="card-action"><span data-slot="badge" data-variant="outline">Monthly</span></div>
          </div>
          <div data-slot="card-footer" class="flex-col items-start gap-2 text-sm"><span class="font-medium">For this month</span><span class="text-muted-foreground">Change it with Set budget.</span></div>
        </div>
        <div data-slot="card">
          <div data-slot="card-header">
            <p data-slot="card-description" class="flex items-center gap-2"><span data-slot="icon" data-icon="receipt" aria-hidden="true"></span>Spent</p>
            <div data-slot="card-title" id="stat-spent" class="text-3xl font-semibold tabular-nums"><span data-slot="skeleton" class="block h-8 w-32" aria-hidden="true"></span></div>
            <div data-slot="card-action"><span data-slot="badge" data-variant="outline" id="count-badge">0 expenses</span></div>
          </div>
          <div data-slot="card-footer" class="flex-col items-start gap-2 text-sm"><progress data-slot="progress" id="used" class="w-full" value="0" max="1" aria-label="Share of the budget spent"></progress><span class="text-muted-foreground">Of the budget, so far</span></div>
        </div>
        <div data-slot="card">
          <div data-slot="card-header">
            <p data-slot="card-description" class="flex items-center gap-2"><span data-slot="icon" data-icon="piggy-bank" aria-hidden="true"></span><span id="stat-left-label">Left</span></p>
            <div data-slot="card-title" id="stat-left" class="text-3xl font-semibold tabular-nums"><span data-slot="skeleton" class="block h-8 w-32" aria-hidden="true"></span></div>
            <div data-slot="card-action"><span data-slot="badge" data-variant="success" id="within-badge">Within budget</span><span data-slot="badge" data-variant="destructive" id="over-badge" hidden><span data-slot="icon" data-icon="triangle-alert" aria-hidden="true"></span>Over budget</span></div>
          </div>
          <div data-slot="card-footer" class="flex-col items-start gap-2 text-sm"><span class="font-medium" id="stat-left-note">Until the budget is spent</span><span class="text-muted-foreground">Decided by the model, never the page.</span></div>
        </div>
      </section>

      <div class="grid gap-6 lg:grid-cols-5 items-start">
        <form data-slot="card" id="add-form" class="lg:col-span-2" aria-labelledby="add-title" novalidate autocomplete="off">
          <div data-slot="card-header">
            <h2 data-slot="card-title" id="add-title">Add an expense</h2>
            <p data-slot="card-description">The model checks it and keeps the totals.</p>
          </div>
          <div data-slot="card-content">
            <div data-slot="field-group">
            <div data-slot="field" id="amount-field">
              <label data-slot="field-label" for="amount">Amount</label>
              <div data-slot="input-group">
                <div data-slot="input-group-addon"><span aria-hidden="true">&euro;</span></div>
                <input data-slot="input-group-control" id="amount" class="md:text-sm" inputmode="decimal" placeholder="12.50">
              </div>
              <p data-slot="field-error" id="amount-error" hidden></p>
            </div>
            <div data-slot="field" id="category-field">
              <fieldset data-slot="choice-group" id="category" class="grid grid-cols-2 gap-3">
                <legend data-slot="field-legend">Category</legend>
                <label data-slot="choice"><input type="radio" name="category" value="food" checked><span data-slot="icon" data-icon="utensils" data-size="md" class="text-muted-foreground" aria-hidden="true"></span><span class="font-medium">Food</span><span class="text-xs text-muted-foreground">Groceries, meals</span></label>
                <label data-slot="choice"><input type="radio" name="category" value="home"><span data-slot="icon" data-icon="house" data-size="md" class="text-muted-foreground" aria-hidden="true"></span><span class="font-medium">Home</span><span class="text-xs text-muted-foreground">Rent, bills</span></label>
                <label data-slot="choice"><input type="radio" name="category" value="travel"><span data-slot="icon" data-icon="plane" data-size="md" class="text-muted-foreground" aria-hidden="true"></span><span class="font-medium">Travel</span><span class="text-xs text-muted-foreground">Trips, transport</span></label>
                <label data-slot="choice"><input type="radio" name="category" value="fun"><span data-slot="icon" data-icon="sparkles" data-size="md" class="text-muted-foreground" aria-hidden="true"></span><span class="font-medium">Fun</span><span class="text-xs text-muted-foreground">Outings, hobbies</span></label>
              </fieldset>
              <p data-slot="field-error" id="category-error" hidden></p>
            </div>
            <div data-slot="field" id="description-field">
              <label data-slot="field-label" for="description">Description</label>
              <input data-slot="input" id="description" class="md:text-sm" placeholder="Groceries" aria-describedby="description-hint">
              <p data-slot="field-description" id="description-hint">Optional.</p>
              <p data-slot="field-error" id="description-error" hidden></p>
            </div>
            </div>
            <div data-slot="alert" data-variant="destructive" id="add-alert" class="mt-4" hidden>
              <p data-slot="alert-title">Not added</p>
              <p data-slot="alert-description" id="add-alert-text"></p>
            </div>
          </div>
          <div data-slot="card-footer">
            <button data-slot="button" type="submit" id="add-button" class="w-full"><span data-slot="icon" data-icon="plus" aria-hidden="true"></span>Add expense</button>
          </div>
        </form>

        <div class="grid gap-6 lg:col-span-3">
        <section data-slot="card" aria-labelledby="chart-title">
          <div data-slot="card-header">
            <h2 data-slot="card-title" id="chart-title">By category</h2>
            <p data-slot="card-description">Spent this month</p>
          </div>
          <div data-slot="card-content">
            <figure data-slot="chart" data-type="bar" data-currency="EUR" id="chart" data-values="" aria-label="Spending by category" hidden></figure>
            <div data-slot="empty" id="chart-empty">
              <span data-slot="icon" data-icon="chart-column" data-size="xl" class="text-muted-foreground" aria-hidden="true"></span>
              <h3>Nothing spent yet</h3>
              <p>Each category's total appears here as the model adds it up.</p>
            </div>
          </div>
        </section>

      <section data-slot="card" aria-labelledby="list-title">
        <div data-slot="card-header">
          <h2 data-slot="card-title" id="list-title">Expenses</h2>
          <p data-slot="card-description" id="list-description">This month, oldest first</p>
        </div>
        <div data-slot="card-content">
          <div data-slot="item-group" id="rows" role="list" aria-label="Expenses this month" hidden></div>
          <div data-slot="empty" id="list-empty">
            <span data-slot="icon" data-icon="receipt" data-size="xl" class="text-muted-foreground" aria-hidden="true"></span>
            <h3>No expenses yet</h3>
            <p>Add the first one and the model keeps the totals.</p>
            <button data-slot="button" data-variant="outline" type="button" id="start"><span data-slot="icon" data-icon="plus" aria-hidden="true"></span>Add an expense</button>
          </div>
        </div>
      </section>
        </div>
      </div>

      <p class="text-center text-xs text-muted-foreground">The model's rules are proved. This page is authored, not proved: it only shows what the model answers.</p>
    </main>
  </div>

  <dialog data-slot="dialog" id="remove-dialog" aria-labelledby="remove-title" aria-describedby="remove-text">
    <div data-slot="dialog-header">
      <h2 data-slot="dialog-title" id="remove-title">Remove this expense?</h2>
      <p data-slot="dialog-description" id="remove-text"></p>
    </div>
    <div data-slot="dialog-footer">
      <button data-slot="button" data-variant="outline" type="button" data-close>Cancel</button>
      <button data-slot="button" data-variant="destructive" type="button" id="remove-confirm"><span data-slot="icon" data-icon="trash-2" aria-hidden="true"></span>Remove</button>
    </div>
  </dialog>

  <dialog data-slot="dialog" id="budget-dialog" aria-labelledby="budget-title">
    <form id="budget-form" class="grid gap-4" novalidate autocomplete="off">
      <div data-slot="dialog-header">
        <h2 data-slot="dialog-title" id="budget-title">Monthly budget</h2>
        <p data-slot="dialog-description">What you plan to spend this month.</p>
      </div>
      <div data-slot="field" id="budget-field">
        <label data-slot="field-label" for="budget">Budget</label>
        <input data-slot="input" id="budget" class="md:text-sm" inputmode="decimal" placeholder="2000" aria-describedby="budget-hint">
        <p data-slot="field-description" id="budget-hint">In euros.</p>
        <p data-slot="field-error" id="budget-error" hidden></p>
      </div>
      <div data-slot="dialog-footer">
        <button data-slot="button" data-variant="outline" type="button" data-close>Cancel</button>
        <button data-slot="button" type="submit" id="budget-save">Save budget</button>
      </div>
    </form>
  </dialog>
</body>
</html>
```
