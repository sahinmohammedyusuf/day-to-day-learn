/* Web of Knowledge: daily learning tracker. Data lives in this browser's localStorage. */
const KEY = 'learningTracker.v1';           // same key as v1, so old data carries over
const DOW = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const $ = s => document.querySelector(s);

// ---------- dates (local time, "YYYY-MM-DD") ----------
const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const parse = k => new Date(k + 'T00:00:00');
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
const todayKey = () => fmt(new Date());
const nextKey = k => fmt(addDays(parse(k), 1));
const weekOf = k => { const d = parse(k), off = (d.getDay()+6)%7; return Array.from({length:7}, (_, i) => fmt(addDays(d, i-off))); };
const longLabel = k => parse(k).toLocaleDateString([], {weekday:'long', day:'numeric', month:'long'});
const shortLabel = k => parse(k).toLocaleDateString([], {weekday:'short', day:'numeric', month:'short'});

// ---------- state ----------
let state = load();
let activeId = state.tasks[0]?.id;
let sel = todayKey();                         // date being viewed
let view = 'dashboard';                       // 'dashboard' | 'history'
let month = { y: parse(sel).getFullYear(), m: parse(sel).getMonth() };
let refocus = null;

function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s?.tasks) { s.theme ||= 'dark'; s.tasks.forEach(ensure); s.distractions ||= {}; return s; } } catch(e){}
  return { theme:'dark', distractions:{}, tasks:[newTask('Task 1'), newTask('Task 2')] };
}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch(e){} };
function newTask(name) { return ensure({ id:'t'+Date.now()+Math.random().toString(16).slice(2,6), name, days:{} }); }
const activeTask = () => state.tasks.find(t => t.id === activeId);
const peek = (t, k) => t.days[k] || { learned:[], todo:[], top:[] };     // read without creating
const day  = (t, k) => t.days[k] ??= { learned:[], todo:[], top:[] };         // read for writing

// Unfinished to-dos from earlier days move to today
function rollover() {
  const today = todayKey();
  state.tasks.forEach(t => Object.keys(t.days).filter(k => k < today).forEach(k => {
    const left = t.days[k].todo.filter(i => !i.done);
    if (left.length) { day(t, today).todo.push(...left); t.days[k].todo = t.days[k].todo.filter(i => i.done); }
  }));
  save();
}

// ---------- stats ----------
const pct = items => items.length ? Math.round(items.filter(i => i.done).length / items.length * 100) : 0;
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

// ---------- UI helpers ----------
let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 1600);
}
function ask(title, value = '', { input = true, ok = 'Save' } = {}) {
  return new Promise(resolve => {
    const dlg = $('#dlg'), field = $('#dlgInput');
    $('#dlgTitle').textContent = title; $('#dlgOk').textContent = ok;
    field.style.display = input ? '' : 'none'; field.value = value;
    dlg.returnValue = ''; dlg.showModal(); if (input) { field.focus(); field.select(); }
    dlg.onclose = () => resolve(dlg.returnValue === 'ok' ? (input ? field.value.trim() || null : true) : null);
  });
}
$('#dlgCancel').onclick = () => $('#dlg').close('cancel');

// Live clock in the top right corner
function tick() {
  const n = new Date();
  $('#clockTime').textContent = n.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'});
  $('#clockDate').textContent = n.toLocaleDateString([], {weekday:'long', day:'numeric', month:'short', year:'numeric'});
}
setInterval(() => { tick(); timerTick(); }, 1000); tick();

// ---------- render ----------
function render() {
  document.documentElement.dataset.theme = state.theme;
  $('#themeBtn').textContent = state.theme === 'dark' ? 'Light mode' : 'Dark mode';
  const task = activeTask();
  renderTabs();
  renderCalendar(task);
  $('#app').innerHTML = !task
    ? '<p class="empty">No tasks yet. Choose "+ Add task" to start tracking.</p>'
    : heroHTML(task) + viewHTML(task);
  if (refocus) { $(`form[data-add="${refocus}"] input`)?.focus(); refocus = null; }
}

function renderTabs() {
  $('#tabs').innerHTML = state.tasks.map(t =>
    `<button data-tab="${t.id}" class="${t.id === activeId ? 'active' : ''}">${esc(t.name)}</button>`).join('')
    + '<button class="add-task" data-act="addTask">+ Add task</button>';
}

function renderCalendar(task) {
  const first = new Date(month.y, month.m, 1), blanks = (first.getDay()+6)%7;
  const count = new Date(month.y, month.m+1, 0).getDate(), today = todayKey();
  let cells = '';
  for (let i = 0; i < blanks; i++) cells += '<span class="cell blank"></span>';
  for (let d = 1; d <= count; d++) {
    const k = fmt(new Date(month.y, month.m, d)), e = task && task.days[k];
    const dot = e && (e.todo.some(i => !i.done) ? 'pending' : (e.todo.length || e.learned.length) ? 'clear' : '');
    cells += `<button class="cell ${k===today?'today':''} ${k===sel?'sel':''}" data-date="${k}" aria-label="${longLabel(k)}"${k===sel?' aria-current="date"':''}>${d}${dot?`<i class="dot ${dot}"></i>`:''}</button>`;
  }
  const wk = weekOf(sel).map((k, i) => {
    const todo = task ? peek(task, k).todo : [];
    return `<button class="wk-row ${k===sel?'sel':''}" data-date="${k}"><span>${DOW[i]} ${parse(k).getDate()}</span><small>${todo.length ? pct(todo)+'% of '+todo.length : 'No plan'}</small></button>`;
  }).join('');
  $('#cal').innerHTML = `
    <div class="cal-head">
      <button data-nav="-1" aria-label="Previous month">&lsaquo;</button>
      <h2>${new Date(month.y, month.m, 1).toLocaleDateString([], {month:'long', year:'numeric'})}</h2>
      <button data-nav="1" aria-label="Next month">&rsaquo;</button>
    </div>
    <div class="cal-grid">${DOW.map(d => `<span class="cal-dow">${d}</span>`).join('')}${cells}</div>
    <div class="cal-foot">
      <button class="primary" data-act="goToday">Jump to today</button>
      <div class="legend"><span><i class="p"></i>To-dos left</span><span><i class="c"></i>All clear</span></div>
    </div>
    <div class="cal-week"><h3>This week</h3>${wk}</div>`;
}

function heroHTML(task) {
  const isToday = sel === todayKey();
  const todo = [...peek(task, sel).todo, ...(peek(task, sel).top || [])], wk = weekOf(sel).flatMap(k => [...peek(task, k).todo, ...(peek(task, k).top || [])]);
  return `
  <div class="hero">
    <div>
      <h2>${esc(task.name)}</h2>
      <div class="when">${longLabel(sel)}${isToday ? '<span class="badge">Today</span>' : ''}${task.closed[sel] ? '<span class="badge">Closed</span>' : ''}</div>
    </div>
    <div class="tools">
      ${isToday && !task.closed[sel] ? '<button class="primary" data-x="endDay">End day</button>' : ''}
      <button data-act="rename">Rename</button>
      <button class="danger" data-act="delTask">Delete</button>
    </div>
  </div>
  ${greetHTML(task)}
  <div class="stats">
    <div class="stat"><b>${streak(task)}</b><span>Day streak</span><small>${qualifies(task, todayKey()) ? 'Today counts' : 'Needs 30 min focus or 3 problems'}</small></div>
    <div class="stat"><b>${hm(focusMin(task, sel))}</b><span>${isToday ? 'Focused today' : 'Focused this day'}</span></div>
    <div class="stat"><b>${pct(todo)}%</b><span>${isToday ? 'Today' : 'This day'}'s tasks done</span><div class="track"><div class="fill" style="width:${pct(todo)}%"></div></div></div>
    <div class="stat"><b>${pct(wk)}%</b><span>Week complete</span><div class="track"><div class="fill" style="width:${pct(wk)}%"></div></div></div>
  </div>
  ${navHTML()}`;
}

function listHTML(items, kind, key, doneable) {
  if (!items.length) return '<p class="empty">Nothing here yet.</p>';
  return '<ul>' + items.map((it, i) => {
    const text = doneable ? it.text : it, done = doneable && it.done, ref = `${kind}|${key}|${i}`;
    return `<li class="${done?'done':''}">
      ${doneable ? `<input type="checkbox" data-check="${ref}" ${done?'checked':''} aria-label="Mark done: ${esc(text)}">` : ''}
      <span>${esc(text)}</span>
      <button class="ghost" data-edit="${ref}">Edit</button>
      <button class="ghost" data-del="${ref}">Delete</button>
    </li>`; }).join('') + '</ul>';
}
const addForm = (kind, key, ph) =>
  `<form class="add" data-add="${kind}|${key}"><input type="text" placeholder="${ph}" aria-label="${ph}" autocomplete="off"><button class="primary">Add</button></form>`;

function dashboardHTML(task) {
  const nk = nextKey(sel), isToday = sel === todayKey();
  const lbl = isToday ? 'today' : shortLabel(sel);
  const nlbl = nk === nextKey(todayKey()) && isToday ? 'tomorrow' : shortLabel(nk);
  const wk = weekOf(sel), top = peek(task, sel).top || [];
  return `<div class="grid">
    <section class="card"><h2>Top 3 ${lbl} <small>${top.filter(i => i.done).length} / 3 done</small></h2>
      ${listHTML(top,'top',sel,true)}${top.length < 3 ? addForm('top',sel,'Pick an important task') : '<p class="empty">Top 3 is full. Finish one to make room.</p>'}</section>
    ${revCard(task)}
    <section class="card"><h2>Learned ${lbl}</h2>
      ${listHTML(peek(task,sel).learned,'learned',sel,false)}${addForm('learned',sel,'What did you learn?')}</section>
    <section class="card blue"><h2>To-do ${lbl}</h2>
      ${listHTML(peek(task,sel).todo,'todo',sel,true)}${addForm('todo',sel,'Add a to-do')}</section>
    <section class="card blue wide"><h2>Plan for ${nlbl}</h2>
      ${listHTML(peek(task,nk).todo,'todo',nk,true)}${addForm('todo',nk,'Add a topic to cover')}</section>
    ${distractCard()}
    <section class="card wide"><h2>Week plan <small>${shortLabel(wk[0])} to ${shortLabel(wk[6])}</small></h2>
      <div class="week">${wk.map((k, i) => `
        <div class="day ${k===sel?'sel':''}">
          <h3><button data-date="${k}">${DOW[i]}</button><small>${parse(k).getDate()} ${parse(k).toLocaleDateString([], {month:'short'})}</small></h3>
          ${listHTML(peek(task,k).todo,'todo',k,true)}${addForm('todo',k,'Add topic')}
        </div>`).join('')}
      </div></section>
  </div>`;
}

function historyHTML(task) {
  const days = Object.keys(task.days).filter(k => task.days[k].learned.length).sort().reverse();
  return `<section class="card">${days.length ? days.map(k => `
    <div class="hist-day"><b>${longLabel(k)}</b><ul>${task.days[k].learned.map(t => `<li><span>${esc(t)}</span></li>`).join('')}</ul></div>`).join('')
    : '<p class="empty">No learning logged yet. Add what you learned and it will appear here by date.</p>'}</section>`;
}

// ---------- events (delegated, so re-rendering never breaks them) ----------
const listFor = (task, kind, key) => kind === 'learned' ? day(task, key).learned : kind === 'top' ? (day(task, key).top ||= []) : day(task, key).todo;
const closeCal = () => document.body.classList.remove('cal-open');

document.addEventListener('click', async e => {
  const el = e.target.closest('[data-date],[data-nav],[data-tab],[data-view],[data-act],[data-del],[data-edit]');
  if (!el) return;
  const task = activeTask(), d = el.dataset;

  if (d.date) { sel = d.date; month = { y: parse(sel).getFullYear(), m: parse(sel).getMonth() }; closeCal(); return render(); }
  if (d.nav) { month.m += +d.nav; if (month.m < 0) { month.m = 11; month.y--; } if (month.m > 11) { month.m = 0; month.y++; } return renderCalendar(task); }
  if (d.tab) { activeId = d.tab; view = 'dashboard'; return render(); }
  if (d.view) { view = d.view; return render(); }

  if (d.act === 'goToday') { sel = todayKey(); month = { y: parse(sel).getFullYear(), m: parse(sel).getMonth() }; closeCal(); return render(); }
  if (d.act === 'addTask') {
    const name = await ask('Name your new task'); if (!name) return;
    const t = newTask(name); state.tasks.push(t); activeId = t.id; save(); return render();
  }
  if (d.act === 'rename' && task) {
    const name = await ask('Rename task', task.name); if (name) { task.name = name; save(); render(); } return;
  }
  if (d.act === 'delTask' && task) {
    if (!await ask(`Delete "${task.name}" and all its data?`, '', { input:false, ok:'Delete' })) return;
    state.tasks = state.tasks.filter(t => t.id !== task.id); activeId = state.tasks[0]?.id; save(); return render();
  }
  if (d.del) { const [k, key, i] = d.del.split('|'); listFor(task, k, key).splice(i, 1); save(); return render(); }
  if (d.edit) {
    const [k, key, i] = d.edit.split('|'), l = listFor(task, k, key);
    const text = await ask('Edit item', k !== 'learned' ? l[i].text : l[i]); if (!text) return;
    if (k !== 'learned') l[i].text = text; else l[i] = text; save(); render();
  }
});

document.addEventListener('submit', e => {
  const f = e.target.closest('form[data-add]'); if (!f) return;
  e.preventDefault();
  const text = f.querySelector('input').value.trim(); if (!text) return;
  const [kind, key] = f.dataset.add.split('|');
  listFor(activeTask(), kind, key).push(kind !== 'learned' ? { text, done:false } : text);
  refocus = f.dataset.add; save(); render();
});

document.addEventListener('change', e => {
  const c = e.target.closest('[data-check]'); if (!c) return;
  const [kind, key, i] = c.dataset.check.split('|');
  listFor(activeTask(), kind, key)[i].done = c.checked; save(); render();
  if (c.checked) toast('Nice swing! Task done.');
});

$('#themeBtn').onclick = () => { state.theme = state.theme === 'dark' ? 'light' : 'dark'; save(); render(); };
$('#menuBtn').onclick = () => document.body.classList.add('cal-open');
$('#scrim').onclick = closeCal;

// Keep "today" correct if the tab stays open past midnight
let lastDay = todayKey();
setInterval(() => { if (todayKey() !== lastDay) { lastDay = todayKey(); rollover(); render(); } }, 30000);

initFeatures();
rollover();
render();
