/* features.js: Top 3, focus timer, roadmap, spaced revision, problems, mistake book,
   distractions, weekly report and End Day. Loaded before app.js; uses its globals at run time. */
const CPP_ROADMAP = ['Basics','Loops','Arrays','Functions','Pointers','OOP','STL','Embedded C++','Bit Manipulation','RTOS'];
const REV_GAPS = [1, 3, 7, 14];            // revisions after finishing a topic
const MISTAKE_GAPS = [1, 3, 7, 14, 30];   // mistake review spacing
const VIEWS = [['dashboard','Dashboard'],['focus','Focus'],['roadmap','Roadmap'],['problems','Problems'],['mistakes','Mistake book'],['report','Weekly report'],['history','History']];
const dateAfter = n => fmt(addDays(new Date(), n));
const uid = () => Math.random().toString(16).slice(2, 10);
const hm = m => m >= 60 ? `${Math.floor(m/60)}h ${m%60}m` : `${m}m`;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const know = p => p.noHelp && p.explain && p.memory;

function ensure(t) {
  t.roadmap ||= []; t.problems ||= []; t.mistakes ||= []; t.sessions ||= []; t.revisions ||= []; t.closed ||= {};
  return t;
}

// ---------- numbers ----------
const focusMin = (t, k) => t.sessions.filter(s => s.date === k).reduce((a, s) => a + s.minutes, 0);
const solvedOn = (t, k) => t.problems.filter(p => p.solvedOn === k).length + t.sessions.filter(s => s.date === k).reduce((a, s) => a + (s.problems || 0), 0);
// A day only counts toward the streak with real work: 30 min focused OR 3 problems
const qualifies = (t, k) => focusMin(t, k) >= 30 || solvedOn(t, k) >= 3;
function streak(t) {
  let n = 0, d = new Date();
  if (!qualifies(t, fmt(d))) d = addDays(d, -1);
  while (qualifies(t, fmt(d))) { n++; d = addDays(d, -1); }
  return n;
}
function topicStats(t) {
  return t.roadmap.map(r => {
    const probs = t.problems.filter(p => p.topic.trim().toLowerCase() === r.name.toLowerCase());
    const s = r.status === 'done' ? 1 : r.status === 'doing' ? .5 : 0;
    const k = probs.length ? probs.filter(know).length / probs.length : null;
    return { r, score: Math.round((k === null ? s : (s + k) / 2) * 100), known: k === null ? null : Math.round(k * 100) };
  });
}
const dueRevs = t => t.revisions.filter(r => !r.done && r.due <= todayKey());
const dueMistakes = t => t.mistakes.filter(m => m.reviewAt <= todayKey());
const weakest = st => st.length ? st.reduce((a, b) => b.score < a.score ? b : a) : null;

// ---------- view router ----------
function viewHTML(t) {
  return ({ focus:focusHTML, roadmap:roadmapHTML, problems:problemsHTML, mistakes:mistakesHTML, report:reportHTML, history:historyHTML })[view]?.(t) || dashboardHTML(t);
}
const navHTML = () => '<div class="sub">' + VIEWS.map(([v, l]) => `<button data-view="${v}" class="${view === v ? 'active' : ''}">${l}</button>`).join('') + '</div>';

// ---------- dashboard pieces ----------
function greetHTML(t) {
  if (sel !== todayKey()) return '';
  const h = new Date().getHours(), g = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  const top = (peek(t, sel).top || []).filter(i => !i.done).length;
  const text = t.closed[sel] ? 'Day closed. Rest well.'
    : `${top ? plural(top, 'top task') + ' left' : 'Pick your Top 3'}, ${plural(dueRevs(t).length, 'revision')} due, ${plural(dueMistakes(t).length, 'mistake')} to review.`;
  return `<div class="greet"><b>${g}.</b> ${text}</div>`;
}
function revCard(t) {
  const rs = dueRevs(t), ms = dueMistakes(t), today = todayKey();
  const rows = rs.map(r => `<li><span>${esc(r.topic)} <small>revision ${r.step} of ${REV_GAPS.length}${r.due < today ? ', overdue' : ''}</small></span><button class="ghost" data-x="revDone" data-id="${r.id}">Done</button></li>`).join('')
    + (ms.length ? `<li><span>${plural(ms.length, 'mistake')} to review</span><button class="ghost" data-view="mistakes">Open</button></li>` : '');
  return `<section class="card"><h2>Revision due</h2>${rows ? `<ul>${rows}</ul>` : '<p class="empty">Nothing due. Finish a roadmap topic and its revisions are scheduled for you.</p>'}</section>`;
}
function distractCard() {
  const list = state.distractions[sel] || [], by = {};
  list.forEach(x => by[x.src] = (by[x.src] || 0) + x.min);
  const total = list.reduce((a, x) => a + x.min, 0), n = Math.floor(total / 20);
  return `<section class="card blue wide"><h2>Distractions <small>${hm(total)} logged</small></h2>
    ${total ? `<ul>${Object.keys(by).map(s => `<li><span>${s}</span><b>${hm(by[s])}</b></li>`).join('')}</ul>
      <p class="empty">That time could have covered ${n ? plural(n, 'easy problem') + ' (20 min each) or ' : ''}a revision session.</p>`
      : '<p class="empty">Nothing logged. Note what pulled you away to see where the time goes.</p>'}
    <form class="add" data-f="distract"><select name="src"><option>Instagram</option><option>YouTube</option><option>Other</option></select>
      <input type="number" name="min" value="10" min="1" aria-label="Minutes"><button class="primary">I got distracted</button></form></section>`;
}

// ---------- focus timer ----------
const timerLeft = tm => tm.endAt ? Math.max(0, Math.round((tm.endAt - Date.now()) / 1000)) : tm.remaining;
const mmss = s => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
function focusHTML(t) {
  const tm = state.timer, today = todayKey(), ss = t.sessions.filter(s => s.date === today);
  const box = tm
    ? `<div class="timer"><div class="ttopic">${esc(tm.topic)}</div><div id="timerDisplay">${mmss(timerLeft(tm))}</div>
        <div class="actions"><button class="primary" data-x="${tm.endAt ? 'focusPause' : 'focusResume'}">${tm.endAt ? 'Pause' : 'Resume'}</button><button data-x="focusStop">Stop</button></div></div>`
    : `<form class="timer" data-f="focus"><div class="ttopic">Start a focus session</div>
        <div class="add"><input type="text" name="topic" placeholder="Topic, e.g. Arrays" required><input type="number" name="min" value="45" min="1" max="240" aria-label="Minutes"><button class="primary">Start</button></div></form>`;
  return `${box}<section class="card blue"><h2>Today <small>${hm(focusMin(t, today))} focused</small></h2>
    ${ss.length ? '<ul>' + ss.map(s => `<li><span>${esc(s.topic)}</span><small>${hm(s.minutes)}, ${plural(s.problems || 0, 'problem')}</small></li>`).join('') + '</ul>' : '<p class="empty">No sessions yet today.</p>'}</section>`;
}
function timerTick() {
  const tm = state.timer; if (!tm || !tm.endAt) return;
  const r = timerLeft(tm), el = $('#timerDisplay');
  if (el) el.textContent = mmss(r);
  document.title = `${mmss(r)} Focus`;
  if (r <= 0) finishTimer(true);
}
async function finishTimer(auto) {
  const tm = state.timer; if (!tm || tm.finishing) return;
  tm.finishing = true;
  const rem = timerLeft(tm), mins = Math.round((tm.total - rem) / 60);
  document.title = 'Web of Knowledge | Daily Learning Tracker';
  if (mins >= 1) {
    const ans = await ask(`${auto ? 'Session complete. ' : ''}${hm(mins)} on ${tm.topic}. How many problems did you solve?`, '0');
    const t = state.tasks.find(x => x.id === tm.taskId) || activeTask();
    t.sessions.push({ date: todayKey(), topic: tm.topic, minutes: mins, problems: Math.max(0, parseInt(ans, 10) || 0) });
    toast(`${hm(mins)} focused. Saved.`);
  }
  state.timer = null; save(); render();
}

// ---------- roadmap + readiness ----------
function roadmapHTML(t) {
  const st = topicStats(t), done = t.roadmap.filter(r => r.status === 'done').length;
  const p = t.roadmap.length ? Math.round(done / t.roadmap.length * 100) : 0;
  const overall = st.length ? Math.round(st.reduce((a, x) => a + x.score, 0) / st.length) : 0, weak = weakest(st);
  const FIELDS = [['concepts','Concepts'],['practice','Practice problems'],['interview','Interview questions'],['notes','Your notes']];
  const topics = st.map(({ r, score }) => `<details class="topic ${r.status}"><summary>
      <span class="mark">${r.status === 'done' ? '✓' : r.status === 'doing' ? '→' : '○'}</span><b>${esc(r.name)}</b><small>${score}% ready</small>
      <button data-x="cycle" data-id="${r.id}">${r.status === 'done' ? 'Done' : r.status === 'doing' ? 'In progress' : 'Not started'}</button></summary>
      ${FIELDS.map(([f, l]) => `<label>${l}<textarea rows="2" data-note="${r.id}|${f}">${esc(r[f] || '')}</textarea></label>`).join('')}
      <button class="ghost" data-x="delTopic" data-id="${r.id}">Remove topic</button></details>`).join('');
  const pend = t.revisions.filter(r => !r.done).sort((a, b) => a.due.localeCompare(b.due));
  return `<section class="card"><h2>${esc(t.name)} roadmap <small>${p}% complete</small></h2>
      <div class="track"><div class="fill" style="width:${p}%"></div></div>
      ${st.length ? `<p class="empty">Readiness ${overall}%. ${weak ? `Weakest area: ${esc(weak.r.name)} (${weak.score}%). Study this next.` : ''}</p>` : ''}
      ${topics || '<p class="empty">No topics yet. Add your own or load the C++ roadmap.</p>'}
      <form class="add" data-f="topic"><input type="text" name="name" placeholder="Add a topic" required><button class="primary">Add</button>
        ${t.roadmap.length ? '' : '<button type="button" data-x="loadCpp">Load C++ roadmap</button>'}</form></section>
    <section class="card blue"><h2>Revision schedule</h2>${pend.length ? '<ul>' + pend.map(r => `<li><span>${esc(r.topic)} <small>revision ${r.step}</small></span><small>${r.due}</small></li>`).join('') + '</ul>' : '<p class="empty">Mark a topic as done and four revisions are scheduled (+1, +3, +7, +14 days).</p>'}</section>`;
}

// ---------- problems ----------
function problemsHTML(t) {
  const ps = t.problems.slice().reverse();
  const CHK = [['solved','Solved'],['noHelp','Solved without help'],['explain','Can explain'],['memory','Can code from memory']];
  return `<section class="card"><h2>Coding problems <small>${ps.filter(p => p.solved).length} solved, ${ps.filter(know).length} truly known</small></h2>
    <form class="add wrap" data-f="problem"><input type="text" name="title" placeholder="Problem, e.g. Reverse an array" required>
      <input type="text" name="topic" list="topics" placeholder="Topic"><datalist id="topics">${t.roadmap.map(r => `<option value="${esc(r.name)}">`).join('')}</datalist>
      <select name="diff"><option>Easy</option><option>Medium</option><option>Hard</option></select><button class="primary">Add</button></form></section>
    ${ps.map(p => `<section class="card prob blue"><div class="ph"><b>${esc(p.title)}</b><small>${esc(p.topic || 'No topic')} · ${p.diff}</small>${know(p) ? '<span class="badge">Know it</span>' : ''}
        <button class="ghost" data-x="delProblem" data-id="${p.id}">Delete</button></div>
      <div class="checks">${CHK.map(([f, l]) => `<label><input type="checkbox" data-pchk="${p.id}|${f}" ${p[f] ? 'checked' : ''}> ${l}</label>`).join('')}</div>
      <div class="meta">Attempts <button data-x="att" data-id="${p.id}" data-d="-1" aria-label="Fewer attempts">-</button><b>${p.attempts}</b><button data-x="att" data-id="${p.id}" data-d="1" aria-label="More attempts">+</button>
        <label>Time <input type="number" min="0" data-ptime="${p.id}" value="${p.time || ''}" placeholder="0"> min</label></div></section>`).join('') || '<p class="empty">Add a problem to track whether you really know it, not just that you saw the answer.</p>'}`;
}

// ---------- mistake book ----------
function mistakesHTML(t) {
  const ms = t.mistakes.slice().sort((a, b) => a.reviewAt.localeCompare(b.reviewAt)), today = todayKey();
  return `<section class="card"><h2>Mistake book <small>${plural(dueMistakes(t).length, 'item')} due</small></h2>
    <form class="stack" data-f="mistake"><input type="text" name="topic" placeholder="Topic, e.g. Arrays" required>
      <textarea name="code" rows="2" placeholder="Code with the mistake" required></textarea>
      <input type="text" name="why" placeholder="Why is it wrong?" required>
      <textarea name="fix" rows="2" placeholder="Correct code" required></textarea><button class="primary">Save mistake</button></form></section>
    ${ms.map(m => `<section class="card mist ${m.reviewAt <= today ? 'due' : 'blue'}"><div class="ph"><b>${esc(m.topic)}</b><small>Review ${m.reviewAt <= today ? 'due now' : m.reviewAt}</small></div>
      <pre class="bad">${esc(m.code)}</pre><p>Why: ${esc(m.why)}</p><pre class="good">${esc(m.fix)}</pre>
      <div class="actions"><button data-x="reviewed" data-id="${m.id}">Reviewed</button><button class="ghost" data-x="delMistake" data-id="${m.id}">Delete</button></div></section>`).join('') || '<p class="empty">No mistakes saved. Each one you log becomes part of your personal mistake book.</p>'}`;
}

// ---------- weekly report ----------
function reportHTML(t) {
  const wk = weekOf(sel), st = topicStats(t);
  const focus = wk.map(k => focusMin(t, k)), probs = wk.reduce((a, k) => a + solvedOn(t, k), 0);
  const topicsDone = t.roadmap.filter(r => wk.includes(r.doneOn)).length;
  const revs = t.revisions.filter(r => wk.includes(r.due)), revPct = revs.length ? Math.round(revs.filter(r => r.done).length / revs.length * 100) + '%' : 'none due';
  const tasks = pct(wk.flatMap(k => [...peek(t, k).todo, ...(peek(t, k).top || [])]));
  const lost = wk.reduce((a, k) => a + (state.distractions[k] || []).reduce((s, x) => s + x.min, 0), 0);
  const best = Math.max(...focus), bi = focus.indexOf(best);
  const withKnown = st.filter(x => x.known !== null), weak = withKnown.length ? withKnown.reduce((a, b) => b.known < a.known ? b : a) : weakest(st);
  const next = t.roadmap.find(r => r.status === 'doing') || t.roadmap.find(r => r.status === 'todo');
  const rec = [];
  if (weak) rec.push(`Spend more time on ${weak.r.name}`);
  if (dueRevs(t).length) rec.push(`Clear ${plural(dueRevs(t).length, 'due revision')}`);
  if (next) rec.push(`${next.status === 'doing' ? 'Complete' : 'Start'} ${next.name}`);
  if (probs < 5) rec.push('Solve 5 more problems');
  const row = (l, v) => `<li><span>${l}</span><b>${v}</b></li>`;
  return `<section class="card"><h2>Weekly report <small>${shortLabel(wk[0])} to ${shortLabel(wk[6])}</small></h2><ul>
      ${row('Focus time', hm(focus.reduce((a, b) => a + b, 0)))}${row('Problems solved', probs)}${row('Topics completed', topicsDone)}
      ${row('Revision', revPct)}${row('Tasks completed', tasks + '%')}${row('Distraction time', hm(lost))}</ul>
      <p class="empty">${best > 0 ? `Best day: ${DOW[bi]}, ${hm(best)} focused.` : 'No focus sessions this week yet.'} ${weak ? `Weakest area: ${esc(weak.r.name)} (${weak.known ?? weak.score}%).` : ''}</p></section>
    <section class="card blue"><h2>Next week's recommendation</h2>${rec.length ? '<ul>' + rec.map(r => `<li><span>${esc(r)}</span></li>`).join('') + '</ul>' : '<p class="empty">Add roadmap topics and problems and the report will guide your next week.</p>'}</section>`;
}

// ---------- end day ----------
function endDay(t) {
  const k = todayKey(), d = peek(t, k), items = [...d.todo, ...(d.top || [])];
  const next = [], left = (d.top || []).filter(i => !i.done).slice(0, 2).map(i => i.text);
  next.push(...left);
  const dueTomorrow = t.revisions.filter(r => !r.done && r.due <= dateAfter(1)).length;
  if (dueTomorrow) next.push(`Revise ${plural(dueTomorrow, 'topic')}`);
  const w = weakest(topicStats(t)); if (w) next.push(`Practice ${w.r.name}`);
  const row = (l, v) => `<li><span>${l}</span><b>${v}</b></li>`;
  $('#sumBody').innerHTML = `<h3>Day complete</h3><ul>${row('Focus time', hm(focusMin(t, k)))}${row('Tasks', `${items.filter(i => i.done).length} / ${items.length}`)}
    ${row('Problems', solvedOn(t, k))}${row('Revisions', t.revisions.filter(r => r.doneOn === k).length)}${row('Streak', plural(streak(t), 'day'))}</ul>
    <p class="empty">${qualifies(t, k) ? 'Today counts toward your streak.' : 'Today does not count yet: it needs 30 min focus or 3 problems.'}</p>
    <h4>Tomorrow's priority</h4>${next.length ? '<ul>' + next.map(n => `<li><span>${esc(n)}</span></li>`).join('') + '</ul>' : '<p class="empty">Nothing queued. Pick your Top 3 tomorrow morning.</p>'}`;
  $('#sum').showModal();
}

// ---------- events ----------
function initFeatures() {
  $('#sumCancel').onclick = () => $('#sum').close();
  $('#sumClose').onclick = () => {
    const t = activeTask(), k = todayKey(), tk = nextKey(k);
    t.closed[k] = true;
    const tomorrow = day(t, tk); tomorrow.top ||= [];
    (peek(t, k).top || []).filter(i => !i.done).forEach(i => { if (tomorrow.top.length < 3 && !tomorrow.top.some(x => x.text === i.text)) tomorrow.top.push({ text: i.text, done: false }); });
    save(); $('#sum').close(); render(); toast('Day closed. See you tomorrow.');
  };

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-x]'); if (!el) return;
    const t = activeTask(), id = el.dataset.id, x = el.dataset.x, tm = state.timer;
    if (x === 'endDay') return endDay(t);
    if (x === 'focusPause') { tm.remaining = timerLeft(tm); tm.endAt = null; document.title = 'Web of Knowledge | Daily Learning Tracker'; }
    else if (x === 'focusResume') tm.endAt = Date.now() + tm.remaining * 1000;
    else if (x === 'focusStop') return finishTimer(false);
    else if (x === 'loadCpp') CPP_ROADMAP.forEach(n => t.roadmap.push({ id: uid(), name: n, status: 'todo' }));
    else if (x === 'cycle') {
      const r = t.roadmap.find(q => q.id === id), order = ['todo', 'doing', 'done'];
      r.status = order[(order.indexOf(r.status) + 1) % 3];
      t.revisions = t.revisions.filter(v => v.topicId !== r.id || v.done);
      if (r.status === 'done') {
        r.doneOn = todayKey();
        REV_GAPS.forEach((g, i) => t.revisions.push({ id: uid(), topicId: r.id, topic: r.name, due: dateAfter(g), step: i + 1, done: false }));
        toast('Revisions scheduled.');
      } else delete r.doneOn;
    }
    else if (x === 'delTopic') t.roadmap = t.roadmap.filter(r => r.id !== id), t.revisions = t.revisions.filter(v => v.topicId !== id);
    else if (x === 'revDone') { const v = t.revisions.find(q => q.id === id); v.done = true; v.doneOn = todayKey(); toast('Revision done.'); }
    else if (x === 'delProblem') t.problems = t.problems.filter(p => p.id !== id);
    else if (x === 'att') { const p = t.problems.find(q => q.id === id); p.attempts = Math.max(0, p.attempts + +el.dataset.d); }
    else if (x === 'reviewed') { const m = t.mistakes.find(q => q.id === id); m.step++; m.reviewAt = dateAfter(MISTAKE_GAPS[Math.min(m.step, MISTAKE_GAPS.length - 1)]); toast('Review logged.'); }
    else if (x === 'delMistake') t.mistakes = t.mistakes.filter(m => m.id !== id);
    save(); render();
  });

  document.addEventListener('submit', e => {
    const f = e.target.closest('form[data-f]'); if (!f) return;
    e.preventDefault();
    const t = activeTask(), v = Object.fromEntries(new FormData(f)), kind = f.dataset.f;
    if (kind === 'focus') { const total = Math.max(1, +v.min || 45) * 60; state.timer = { taskId: t.id, topic: v.topic.trim(), total, remaining: total, endAt: Date.now() + total * 1000 }; }
    else if (kind === 'topic') t.roadmap.push({ id: uid(), name: v.name.trim(), status: 'todo' });
    else if (kind === 'problem') t.problems.push({ id: uid(), title: v.title.trim(), topic: v.topic.trim(), diff: v.diff, attempts: 1, solved: false, noHelp: false, explain: false, memory: false });
    else if (kind === 'mistake') t.mistakes.push({ id: uid(), topic: v.topic.trim(), code: v.code, why: v.why.trim(), fix: v.fix, step: 0, reviewAt: dateAfter(1) });
    else if (kind === 'distract') { (state.distractions[sel] ||= []).push({ src: v.src, min: Math.max(1, +v.min || 1) }); toast('Logged. Back to it.'); }
    save(); render();
  });

  document.addEventListener('change', e => {
    const t = activeTask(), el = e.target;
    if (el.dataset.pchk) {
      const [id, f] = el.dataset.pchk.split('|'), p = t.problems.find(q => q.id === id);
      p[f] = el.checked;
      if (f === 'solved') p.solvedOn = el.checked ? (p.solvedOn || todayKey()) : null;
      save(); render();
    } else if (el.dataset.ptime) { t.problems.find(q => q.id === el.dataset.ptime).time = Math.max(0, +el.value || 0); save(); }
    else if (el.dataset.note) { const [id, f] = el.dataset.note.split('|'); t.roadmap.find(r => r.id === id)[f] = el.value; save(); }
  });
}
