/* Public agent endpoint (#a.<id>) and member compose (#send.<id>): the sender experience */
(function (A) {
  const esc = A.esc, I = A.icon, E = A.Engine, B = A.brand;
  const VALUE_BY_CAT = { fundraising: 0.7, intro: 0.6, partnership: 0.55, press: 0.4, advisory: 0.4, sales: 0.3, recruiting: 0.3, support: 0.3, other: 0.25 };
  const ACTIONS = [['meet', 'Meeting'], ['reply', 'Reply'], ['intro', 'Introduction'], ['review', 'Review'], ['quote', 'Quote']];
  let st = null;      // { to, mode, phase, it, sender, r, r0 }
  let evSeq = 0;
  function first(p) { return (p.name || '').split(' ')[0]; }

  function example(to) {
    if (to === A.me) return { cat: 'fundraising', action: 'meet', obj: 'Request a 20-minute meeting about Driftline’s $800K pre-seed.', val: 'Driftline runs small language models on edge devices for field technicians. Three paid pilots and 40% monthly usage growth.', tags: ['Inference', 'Edge AI'], stage: 'Pre-seed', amt: 800, geo: 'Europe', urg: 'normal', ev: [['traction', '3 paid pilots, $9K MRR, 40% MoM usage growth'], ['round', '$800K pre-seed, $300K committed'], ['deck', 'Deck, 14 slides']] };
    const tpl = (A.P(to).tpl) || 'founder';
    if (tpl === 'founder') return { cat: 'fundraising', action: 'meet', obj: 'Discuss a $900K lead check in your pre-seed round.', val: 'Tidewell leads pre-seed rounds in AI infrastructure. Our 21 portfolio companies can become design partners.', tags: (A.P(to).topics || []).slice(0, 2), stage: 'Pre-seed', amt: 900, geo: 'Europe', urg: 'normal', ev: [['round', '$900K lead check, standard terms'], ['context', 'Warm path through Grace Liu']] };
    if (tpl === 'investor' || tpl === 'partnership') return { cat: 'partnership', action: 'meet', obj: 'Co-invest on two AI infrastructure deals in Q4.', val: 'Tidewell writes pre-seed checks and wants a seed partner; deal flow goes both ways.', tags: ['AI infrastructure'], geo: 'Europe', urg: 'normal', ev: [['audience', 'About 40 AI infrastructure pre-seed deals a quarter'], ['mutual_value', 'Two-way deal flow; pro-rata reserved for you'], ['timeline', 'First co-investment in Q4 2026']] };
    if (tpl === 'expert') return { cat: 'advisory', action: 'reply', obj: 'Invite you to speak at Tidewell Founder Day on Nov 12.', val: 'A 30-minute talk on inference economics for 60 portfolio founders.', tags: ['Inference'], geo: 'Europe', urg: 'normal', ev: [['topic', 'Inference economics for early-stage founders'], ['time', '30-minute talk plus 15 minutes of Q&A'], ['fee', 'Travel covered and an honorarium']] };
    if (tpl === 'recruiter') return { cat: 'recruiting', action: 'reply', obj: 'Share a Staff ML Engineer role at a portfolio company.', val: 'Latticeforge is hiring for its inference platform team.', tags: ['AI infrastructure'], geo: 'Europe', urg: 'normal', ev: [['comp', '€120–150K plus equity'], ['remote', 'Hybrid, Amsterdam'], ['teamstage', 'Series A, 64 people']] };
    return { cat: 'intro', action: 'intro', obj: 'Offer an introduction to a portfolio company.', val: 'One of our portfolio founders is looking for exactly what you do.', tags: [], geo: 'Europe', urg: 'normal', ev: [['context', 'Portfolio company of Tidewell Ventures']] };
  }

  function evRow(type, value) {
    const n = evSeq++;
    return '<div class="evrow"><select class="select" id="f-evt-' + n + '" data-ch="f-upd" aria-label="Evidence type">' + Object.keys(A.EVID).map(function (k) { return '<option value="' + k + '"' + (k === type ? ' selected' : '') + '>' + esc(A.EVID[k].label) + '</option>'; }).join('') + '</select>' +
      '<input class="input" id="f-evv-' + n + '" data-in="f-upd" value="' + esc(value || '') + '" placeholder="' + esc((A.EVID[type] || {}).ph || '') + '" aria-label="Evidence detail"><button type="button" class="iconbtn" data-act="f-ev-rm" aria-label="Remove evidence">' + I('x', 'ico-20') + '</button></div>';
  }

  function form(to, mode, ex) {
    const p = A.P(to), f = first(p);
    ex = ex || { cat: 'fundraising', action: 'meet', obj: '', val: '', tags: [], stage: 'Pre-seed', amt: '', geo: '', urg: 'normal', ev: [] };
    const me = A.P(A.me);
    return '<form class="card pad-24 form" data-sub="intent" id="intent-form" novalidate>' +
      '<div class="stack-4"><h2 class="t20">Knock on ' + esc(f) + '’s door</h2><p class="small muted">A knock is a structured Business Intent: it gets a faster, fairer answer than free text. ' + esc(f) + '’s agent may ask follow-up questions, and every decline comes with a reason.</p></div>' +
      (A.live && A.Live.ai ? '<div class="aibox"><label class="label" for="f-free">Write it your way</label><textarea class="textarea" id="f-free" rows="4" maxlength="8000" placeholder="Paste the email or LinkedIn message you would have sent…">' + esc(ex.free || '') + '</textarea>' +
        '<div class="row wrap" style="gap:10px"><button type="button" class="btn btn--secondary btn--sm" data-act="f-parse">' + I('spark', 'ico-16') + 'Fill the form from my text</button><span class="small muted">Your agent reads it and fills in the fields below. Check them before you send.</span></div></div>' : '') +
      (mode === 'public'
        ? '<div class="grid2"><div class="field"><label class="label" for="f-name">Your name</label><input class="input" id="f-name" autocomplete="off" placeholder="e.g. Lucas Moreau" value="' + esc(ex.name || '') + '"></div><div class="field"><label class="label" for="f-org">Company</label><input class="input" id="f-org" autocomplete="off" placeholder="e.g. Driftline" value="' + esc(ex.org || '') + '"></div></div>' + (A.live ? '<p class="small muted">You are sending without an account, so your intent counts as unverified.</p>' : '<label class="check" for="f-ver"><input type="checkbox" id="f-ver" data-ch="f-upd"> I can verify a work email and company domain <span class="small muted">(simulated here)</span></label>')
        : '<div class="row">' + A.avatar(me, 40) + '<div><div class="b">Sending as ' + esc(me.name) + '</div><div class="small muted">Reputation ' + me.rep + ' · ' + me.verified.map(function (v) { return A.CLAIMS[v]; }).join(', ') + '</div></div></div>') +
      '<div class="grid2"><div class="field"><label class="label" for="f-cat">Category</label><select class="select" id="f-cat" data-ch="f-cat">' + Object.keys(A.CATS).map(function (k) { return '<option value="' + k + '"' + (k === ex.cat ? ' selected' : '') + '>' + esc(A.CATS[k].label) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label class="label" for="f-action">Requested action</label><select class="select" id="f-action" data-ch="f-upd">' + ACTIONS.map(function (a) { return '<option value="' + a[0] + '"' + (a[0] === ex.action ? ' selected' : '') + '>' + a[1] + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="field"><label class="label" for="f-obj">Objective</label><input class="input" id="f-obj" data-in="f-upd" maxlength="160" value="' + esc(ex.obj) + '" placeholder="Request a 20-minute meeting about…"></div>' +
      '<div class="field"><label class="label" for="f-val">Why it matters to ' + esc(f) + '</label><textarea class="textarea" id="f-val" rows="3" data-in="f-upd" placeholder="One or two sentences with a concrete number.">' + esc(ex.val) + '</textarea></div>' +
      '<div class="field"><span class="label">Topics</span><div class="pills" id="f-tags">' + A.TOPICS.map(function (t) { const on = ex.tags.indexOf(t) >= 0; return '<button type="button" class="pill' + (on ? ' is-on' : '') + '" aria-pressed="' + on + '" data-act="f-tag" data-v="' + esc(t) + '">' + esc(t) + '</button>'; }).join('') + '</div></div>' +
      '<div class="grid2" id="f-fund"' + (ex.cat === 'fundraising' ? '' : ' hidden') + '><div class="field"><label class="label" for="f-stage">Stage</label><select class="select" id="f-stage" data-ch="f-upd">' + A.STAGES.map(function (s) { return '<option' + (s === ex.stage ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></div><div class="field"><label class="label" for="f-amt">Round size ($K)</label><input class="input" id="f-amt" type="number" min="0" step="50" value="' + esc(ex.amt) + '" data-in="f-upd" placeholder="e.g. 1500"></div></div>' +
      '<div class="grid2"><div class="field"><label class="label" for="f-geo">Geography</label><select class="select" id="f-geo" data-ch="f-upd"><option value="">Not specified</option>' + A.GEOS.map(function (g) { return '<option' + (g === ex.geo ? ' selected' : '') + '>' + g + '</option>'; }).join('') + '</select></div><div class="field"><label class="label" for="f-urg">Urgency</label><select class="select" id="f-urg" data-ch="f-upd"><option value="normal"' + (ex.urg === 'normal' ? ' selected' : '') + '>Normal</option><option value="time_sensitive"' + (ex.urg === 'time_sensitive' ? ' selected' : '') + '>Time-sensitive</option><option value="low"' + (ex.urg === 'low' ? ' selected' : '') + '>Low</option></select></div></div>' +
      '<div class="field"><span class="label">Evidence</span><div class="stack" id="f-ev">' + ex.ev.map(function (e) { return evRow(e[0], e[1]); }).join('') + '</div><div class="row wrap" id="f-ev-sug" style="gap:6px"></div><button type="button" class="btn btn--tertiary btn--sm" data-act="f-ev-add" style="align-self:flex-start">' + I('plus', 'ico-16') + 'Add evidence</button></div>' +
      '<div class="field"><label class="label" for="f-msg">Message (optional)</label><textarea class="textarea" id="f-msg" rows="3" data-in="f-upd">' + esc(ex.msg || '') + '</textarea><span class="hint">Free text is read as data. It can’t give the agent instructions.</span></div>' +
      '<div class="row wrap"><button class="btn btn--primary btn--lg" type="submit">' + I('sendo', 'ico-20') + 'Knock</button><button type="button" class="btn btn--tertiary" data-act="f-example">Fill with an example</button></div>' +
      '</form>';
  }

  function readForm() {
    const g = function (id) { return document.getElementById(id); };
    if (!g('f-cat')) return null;
    const cat = g('f-cat').value;
    const tags = Array.prototype.map.call(document.querySelectorAll('#f-tags .pill.is-on'), function (b) { return b.dataset.v; });
    const evidence = Array.prototype.map.call(document.querySelectorAll('#f-ev .evrow'), function (r) { return { type: r.querySelector('select').value, value: r.querySelector('input').value.trim() }; }).filter(function (e) { return e.value; });
    const text = [g('f-obj').value, g('f-val').value, g('f-msg').value].join(' ');
    const it = {
      id: 'draft', from: st.mode === 'member' ? A.me : null, category: cat, tags: tags, objective: g('f-obj').value.trim(), value: g('f-val').value.trim(), action: g('f-action').value,
      urgency: g('f-urg').value, geo: g('f-geo').value || null, evidence: evidence, text: text, generic: E.parseText(text).intent.generic, valueScore: VALUE_BY_CAT[cat] || 0.3,
    };
    if (cat === 'fundraising') { it.stage = g('f-stage').value; it.amount = (+g('f-amt').value || 0) * 1000 || null; }
    let sender;
    const rel = A.P(st.to);
    if (st.mode === 'member') sender = Object.assign({}, A.P(A.me), { mutuals: rel.mutuals || 0, prior: rel.prior || 0 });
    else {
      // Live senders are unverified until email verification ships; the demo simulates it.
      const ver = !A.live && g('f-ver') && g('f-ver').checked;
      const warm = !A.live && evidence.some(function (e) { return e.type === 'context'; });
      sender = { name: (g('f-name') && g('f-name').value.trim()) || 'Anonymous sender', rep: ver ? 72 : 50, verified: ver ? ['work_email', 'company_domain'] : [], mutuals: warm ? 8 : 0, prior: 0 };
    }
    return { it: it, sender: sender };
  }

  function forecast() {
    const el = document.getElementById('f-forecast');
    const data = readForm();
    if (!el || !data) return;
    const pol = E.policyFor(st.to), r = E.evaluate(data.it, pol, data.sender);
    const f = first(A.P(st.to));
    const tips = [];
    r.missing.forEach(function (m) { tips.push('Add ' + E.lc(A.EVID[m].label)); });
    if (!data.it.objective) tips.push('Write a one-line objective');
    if (!data.it.value) tips.push('Say why it matters to ' + f);
    if (!data.sender.verified.length && pol.requireVerified) tips.push('Verify your work email');
    if (data.it.generic >= 2) tips.push('Cut the stock phrases');
    if (!A.live && r.lane === 'medium' && st.mode === 'public' && !data.it.evidence.some(function (e) { return e.type === 'context'; })) tips.push('Say who referred you (add Context evidence)');
    el.innerHTML = '<div class="row between"><h2 class="card__h">Routing forecast</h2><span class="small muted">Live</span></div>' +
      '<div class="forecast">' + A.ui.gauge(r.score, r.lane) + '<div class="grow stack-4">' + A.ui.lane(r.lane) + '<div class="small b">' + esc(r.action) + '</div></div></div>' +
      '<p class="small muted">' + esc(r.why) + '</p>' +
      (tips.length ? '<div class="stack-4"><div class="eyebrow">To improve</div><ul class="stack-4">' + tips.slice(0, 5).map(function (t) { return '<li class="reason reason--warn">' + I('warn') + '<span class="small">' + esc(t) + '</span></li>'; }).join('') + '</ul></div>' : '<div class="note note--good">' + I('check') + '<span class="small">Everything ' + esc(f) + '’s agent asks for is here.</span></div>');
    const sug = document.getElementById('f-ev-sug');
    if (sug) sug.innerHTML = r.missing.length ? '<span class="small muted">Suggested:</span>' + r.missing.map(function (m) { return '<button type="button" class="pill" data-act="f-ev-add" data-t="' + m + '">' + I('plus', 'ico-16') + esc(A.EVID[m].label) + '</button>'; }).join('') : '';
  }

  function rules(to) {
    const p = A.P(to), pol = E.policyFor(to), isMe = to === A.me, dis = isMe ? A.S.policy.privacy.disclose : { thesis: true, check: true, response: true };
    const f = first(p);
    const open = Object.keys(A.CATS).filter(function (k) { return pol.categories[k] === 'open'; }).map(function (k) { return A.CATS[k].label; });
    const closed = Object.keys(A.CATS).filter(function (k) { return pol.categories[k] === 'closed'; }).map(function (k) { return A.CATS[k].label; });
    return '<div class="card pad stack-12" id="f-rules"><h2 class="card__h">What ' + esc(f) + '’s agent looks for</h2>' +
      (dis.thesis && pol.openTo.length ? '<div class="stack-4"><div class="eyebrow">Topics</div><div class="pills">' + pol.openTo.map(function (t) { return '<span class="tag tag--accent">' + esc(t) + '</span>'; }).join('') + '</div></div>' : '') +
      (dis.check && pol.check.max < 1e11 ? '<div class="stack-4"><div class="eyebrow">First checks</div><div class="small">' + A.money(pol.check.min) + '–' + A.money(pol.check.max) + ' · ' + esc(pol.stages.join(', ')) + '</div></div>' : '') +
      '<div class="stack-4"><div class="eyebrow">Open</div><div class="small">' + esc(open.join(', ') || 'None') + '</div></div>' +
      (closed.length ? '<div class="stack-4"><div class="eyebrow">Closed</div><div class="small">' + esc(closed.join(', ')) + ' (declined automatically)</div></div>' : '') +
      (dis.response ? '<div class="stack-4"><div class="eyebrow">Response times</div><div class="small">HIGH: same day · MEDIUM: next digest · Declines always include a reason</div></div>' : '') +
      '</div>';
  }

  // Live mode: the sender sees the protocol status, never the recipient's lane or score.
  const LIVE_OUTCOME = {
    delivered: ['Delivered to {f}', 'It reaches {f} as a short brief with your evidence attached.', 'good', 'high', 'Delivered'],
    queued_for_digest: ['Queued for {f}’s digest', 'Promising, so it will be in the next digest. You’ll get an answer either way.', 'warn', 'medium', 'In the digest'],
    qualifying: ['{f}’s agent has questions', 'Answer them and the agent re-scores your intent.', 'warn', 'medium', 'Questions'],
    declined: ['Declined with a reason', 'The recipient’s policy declined this intent.', '', 'low', 'Declined'],
    rejected: ['Not delivered', 'The intent was stopped before it reached anyone.', 'bad', 'blocked', 'Not delivered'],
    accepted: ['Accepted', '{f} replied.', 'good', 'high', 'Accepted'],
    scheduled: ['Meeting proposed', '{f} proposed a time.', 'good', 'high', 'Meeting proposed'],
    in_review: ['In review', 'A teammate of {f} owns the next step.', 'good', 'high', 'In review'],
    closed: ['Closed', 'No reply is planned.', '', 'low', 'Closed'],
  };
  function resultLive() {
    const v = st.view, p = A.P(st.to), f = first(p);
    const o = LIVE_OUTCOME[v.status] || LIVE_OUTCOME.queued_for_digest;
    const open = v.open_questions || [];
    const title = open.length ? f + '’s agent has ' + open.length + ' question' + (open.length > 1 ? 's' : '') : o[0].replace('{f}', f);
    const steps = [['Received', 'Stored and screened by ' + f + '’s agent', true]];
    if (st.asked) steps.push(['Qualified', open.length ? 'Waiting for your answers' : 'You answered ' + st.answered + ' question' + (st.answered === 1 ? '' : 's'), !open.length]);
    let h = '<div class="card pad-24 stack-16" id="intent-result"><div class="row between wrap"><h2 class="t20">' + esc(title) + '</h2><span class="lane lane--' + o[3] + '">' + esc(o[4]) + '</span></div>' +
      '<div class="steps">' + steps.map(function (s, i) { return '<div class="step ' + (s[2] ? 'is-done' : 'is-now') + '"><span class="step__dot">' + (s[2] ? I('check') : i + 1) + '</span><div><div class="b">' + s[0] + '</div><div class="small muted">' + esc(s[1]) + '</div></div></div>'; }).join('') +
      (open.length ? '' : '<div class="step is-done"><span class="step__dot">' + I('check') + '</span><div><div class="b">' + esc(o[0].replace('{f}', f)) + '</div><div class="small muted">' + esc(v.decline_reason || o[1].replace('{f}', f)) + '</div></div></div>') + '</div>';
    if (open.length) {
      h += '<form class="form" data-sub="answers">' + open.map(function (q, i) { return '<div class="field"><label class="label" for="q-' + i + '">' + esc(q.text) + '</label><input class="input" id="q-' + i + '" data-t="' + esc(q.type) + '" placeholder="' + esc((A.EVID[q.type] || {}).ph || '') + '" autocomplete="off"></div>'; }).join('') +
        '<div class="row wrap"><button class="btn btn--primary" type="submit">Send answers</button><button class="btn btn--tertiary" type="button" data-act="f-answer-ex">Fill example answers</button></div></form>';
    } else {
      h += '<div class="note' + (o[2] ? ' note--' + o[2] : '') + '">' + I(v.status === 'rejected' ? 'block' : v.status === 'declined' ? 'info' : 'check') + '<div class="small">' +
        (v.status === 'declined' ? 'You can improve the intent and send it again. A polite decline does not hurt your sender reputation.' : v.status === 'rejected' ? 'Text in an intent is treated as data. It can’t instruct the agent.' : 'You’ll get an answer either way. Declines always include a reason.') + '</div></div>' +
        '<div class="row wrap">' + (v.status === 'declined' ? '<button class="btn btn--primary" data-act="f-edit">Improve and resend</button>' : '') + '<button class="btn btn--secondary" data-act="f-new">Send another intent</button>' + (st.mode === 'member' ? '<a class="btn btn--tertiary" href="#inbox.' + esc(v.intent_id) + '">View in Sent</a>' : '') + '</div>';
    }
    return h + '<div class="small faint mono">intent ' + esc(v.intent_id) + '</div></div>';
  }

  function result() {
    if (A.live && st.view) return resultLive();
    const r = st.r, p = A.P(st.to), f = first(p);
    const steps = [['Received', 'Signed and deduplicated', true], ['Screened', 'Scored ' + (st.r0 ? st.r0.score + (st.r0.score !== r.score ? ' → ' + r.score : '') : r.score) + ' against ' + f + '’s policy', true]];
    if (st.r0 && st.r0.questions.length) steps.push(['Qualified', st.phase === 'questions' ? 'Waiting for your answers' : 'You answered ' + st.answered + ' question' + (st.answered === 1 ? '' : 's'), st.phase !== 'questions']);
    const outcome = {
      high: ['Delivered to ' + f, 'Escalated with a 90-second brief. Expected reply: same day.', 'good'],
      medium: ['Queued for ' + f + '’s digest', 'Promising, so it will be in tomorrow’s digest. You’ll get an answer either way.', 'warn'],
      low: ['Declined politely', r.why + (st.to === A.me && r.it.category === 'fundraising' && !r.overlap.length ? ' Aldermoor Capital’s fund agent accepts pitches outside AI infrastructure.' : ''), ''],
      declined: ['Declined with a reason', r.why, ''],
      blocked: ['Not delivered', r.why, 'bad'],
    }[r.lane];
    let h = '<div class="card pad-24 stack-16" id="intent-result"><div class="row between wrap"><h2 class="t20">' + (st.phase === 'questions' ? esc(f) + '’s agent has ' + st.r0.questions.length + ' question' + (st.r0.questions.length > 1 ? 's' : '') : esc(outcome[0])) + '</h2>' + A.ui.lane(r.lane) + '</div>' +
      '<div class="steps">' + steps.map(function (s, i) { return '<div class="step ' + (s[2] ? 'is-done' : 'is-now') + '"><span class="step__dot">' + (s[2] ? I('check') : i + 1) + '</span><div><div class="b">' + s[0] + '</div><div class="small muted">' + esc(s[1]) + '</div></div></div>'; }).join('') +
      (st.phase === 'questions' ? '' : '<div class="step is-done"><span class="step__dot">' + I('check') + '</span><div><div class="b">' + esc(outcome[0]) + '</div><div class="small muted">' + esc(outcome[1]) + '</div></div></div>') + '</div>';
    if (st.phase === 'questions') {
      h += '<form class="form" data-sub="answers">' + st.r0.questions.map(function (q, i) { return '<div class="field"><label class="label" for="q-' + i + '">' + esc(q.q) + '</label><input class="input" id="q-' + i + '" data-t="' + q.type + '" placeholder="' + esc((A.EVID[q.type] || {}).ph || '') + '" autocomplete="off"></div>'; }).join('') +
        '<div class="row wrap"><button class="btn btn--primary" type="submit">Send answers</button><button class="btn btn--tertiary" type="button" data-act="f-answer-ex">Fill example answers</button></div></form>';
    } else {
      h += '<div class="note' + (outcome[2] ? ' note--' + outcome[2] : '') + '">' + I(r.lane === 'high' ? 'check' : r.lane === 'blocked' ? 'block' : 'info') + '<div class="small">' + ({ high: f + ' sees your intent as a short brief with your evidence attached.', medium: 'Nothing else to do. A verified identity and a stated warm path score higher next time.', blocked: 'The text was treated as data. Nothing in it reached the agent’s instructions.' }[r.lane] || 'You can improve the intent and send it again. A polite decline does not hurt your sender reputation.') + '</div></div>' +
        '<div class="row wrap">' + (r.lane === 'low' || r.lane === 'declined' ? '<button class="btn btn--primary" data-act="f-edit">Improve and resend</button>' : '') + '<button class="btn btn--secondary" data-act="f-new">Send another intent</button>' + (st.mode === 'member' ? '<a class="btn btn--tertiary" href="#inbox.' + st.sentId + '">View in Sent</a>' : '') + '</div>';
    }
    h += '<details class="dt__sec"><summary class="link" style="cursor:pointer">Why this outcome</summary>' + A.ui.reasons(r) + A.ui.bars(r) + '</details></div>';
    return h;
  }

  function page(to, mode) {
    const p = A.P(to), f = first(p), addr = A.addrOf(to), isMe = to === A.me && A.S.signedIn;
    const top = '<div class="card card--clip"><div class="cover" style="height:88px;' + A.coverStyle(p.cover || p.c) + '"></div><div class="pad-24 stack-12" style="padding-top:0">' +
      '<div class="endpoint-hero"><div style="margin-top:-36px">' + A.avatar(p, 88, 'av--ring') + '</div><div class="grow" style="padding-top:12px"><h1 class="t20">You’re reaching ' + esc(f) + '’s agent</h1><div class="small muted">' + esc(p.name) + ' · ' + esc(p.headline) + '</div></div></div>' +
      '<div class="row wrap"><span class="live">Agent active</span><span class="small mono muted">' + esc(addr) + '</span><span class="small muted">No account needed</span></div>' +
      (isMe ? '<div class="note">' + I('eye') + '<div class="small">This is what senders see when they open your agent address. Try sending yourself an intent: the result uses your live policy.</div></div>' : '') +
      '</div></div>';
    const body = st && st.to === to && st.phase !== 'form' ? result() : form(to, mode, st && st.to === to && st.ex);
    return '<div class="page"><div class="scaffold scaffold--mr"><div class="main">' + top + '<div id="intent-body">' + body + '</div></div>' +
      '<aside class="rail rail--right"><div class="sticky stack"><div class="card pad stack-12" id="f-forecast"' + (st && st.phase !== 'form' ? ' hidden' : '') + '></div>' + rules(to) + '</div></aside></div></div>';
  }

  function start(to, mode) { if (!st || st.to !== to || st.mode !== mode) st = { to: to, mode: mode, phase: 'form' }; }

  /** Live mode: load the recipient's public policy summary so the forecast and rules match their agent. */
  function loadCard() {
    if (!A.live || !st || st.to === A.me || A.Live.cards[st.to]) return;
    A.Live.card(st.to).then(function () {
      const box = document.getElementById('f-rules');
      if (box) box.outerHTML = rules(st.to);
      if (st.phase === 'form') forecast();
    }, function () { /* the forecast keeps the template estimate */ });
  }

  A.view('a', {
    render: function (arg) {
      const to = A.people[arg] && A.P(arg).kind !== 'agent' ? arg : A.me;
      start(to, 'public');
      return page(to, 'public');
    },
    mount: function () { if (st.phase === 'form') forecast(); loadCard(); },
  });
  A.view('send', {
    nav: 'feed',
    render: function (arg) {
      if (!arg || !A.people[arg] || arg === A.me || A.P(arg).kind === 'agent') {
        const ids = Object.keys(A.people).filter(function (id) { return id !== A.me && A.people[id].kind !== 'agent' && id !== 'rex-dalton' && id.indexOf('anon-') !== 0; });
        return '<div class="page"><div class="card pad-24 stack-16"><div class="stack-4"><h1 class="t24">Knock on someone’s door</h1><p class="muted">Pick a recipient. Their agent screens the intent against their policy and answers you either way.</p></div>' +
          '<div class="pymk" style="padding:0">' + ids.map(function (id) { const u = A.P(id); return '<div class="pymk__c"><div class="pymk__b">' + A.avatar(u, 64) + '<a class="nm" href="#in.' + id + '">' + esc(u.name) + '</a><span class="hl clamp2">' + esc(u.headline) + '</span><span class="small muted">' + esc(A.templates[u.tpl || 'founder'].name) + '</span><a class="btn btn--secondary btn--sm" href="#send.' + id + '">Compose</a></div></div>'; }).join('') + '</div></div></div>';
      }
      start(arg, 'member');
      return page(arg, 'member');
    },
    mount: function (arg) { if (arg && st && st.phase === 'form') forecast(); if (arg) loadCard(); },
  });

  A.inp['f-upd'] = function () { forecast(); };
  A.chg['f-upd'] = function (el) {
    if (el.tagName === 'SELECT' && el.id.indexOf('f-evt-') === 0) { const inp = el.parentNode.querySelector('input'); if (inp) inp.placeholder = (A.EVID[el.value] || {}).ph || ''; }
    forecast();
  };
  A.chg['f-cat'] = function (el) { document.getElementById('f-fund').hidden = el.value !== 'fundraising'; forecast(); };
  A.act['f-tag'] = function (el) { const on = !el.classList.contains('is-on'); el.classList.toggle('is-on', on); el.setAttribute('aria-pressed', String(on)); forecast(); };
  A.act['f-ev-add'] = function (el) {
    const box = document.getElementById('f-ev');
    box.insertAdjacentHTML('beforeend', evRow(el.dataset.t || 'traction', ''));
    const inputs = box.querySelectorAll('input');
    if (inputs.length) inputs[inputs.length - 1].focus();
    forecast();
  };
  A.act['f-ev-rm'] = function (el) { el.closest('.evrow').remove(); forecast(); };
  // Live: the recipient's agent turns free text into the structured fields (the sender still reviews them).
  A.act['f-parse'] = async function (el) {
    const g = function (id) { const e = document.getElementById(id); return e ? e.value.trim() : ''; };
    const text = g('f-free');
    if (text.length < 20) { A.toast('Write a sentence or two first.', 'warn'); document.getElementById('f-free').focus(); return; }
    el.disabled = true;
    const label = el.innerHTML;
    el.innerHTML = I('spark', 'ico-16') + 'Reading…';
    try {
      const r = await A.Live.call('POST', 'v1/intents/parse', { text: text });
      const it = r.intent || {};
      st.ex = {
        cat: it.category || 'other', action: it.requested_action || 'reply', obj: it.objective || '', val: it.value_proposition || '',
        tags: it.topics || [], stage: it.stage || 'Pre-seed', amt: it.round_size_usd ? String(Math.round(it.round_size_usd / 1000)) : '',
        geo: it.geo || '', urg: it.urgency || 'normal', ev: (r.fit_evidence || []).map(function (e) { return [e.type, e.value]; }),
        name: g('f-name'), org: g('f-org'), msg: text, free: text,
      };
      st.phase = 'form';
      A.refresh();
      A.toast('Filled in from your text. Check each field, then send.', 'info');
    } catch (e) { el.disabled = false; el.innerHTML = label; A.toast(esc(e.message), 'warn'); }
  };
  A.act['f-example'] = function () { st.ex = example(st.to); st.phase = 'form'; A.refresh(); };
  A.sub.intent = function () {
    const data = readForm();
    if (!data.it.objective) { A.toast('Add a one-line objective so the agent knows what you want.', 'warn'); document.getElementById('f-obj').focus(); return; }
    if (A.live) {
      const g = function (id) { const e = document.getElementById(id); return e ? e.value.trim() : ''; };
      const body = {
        business_intent_version: A.brand.pv,
        sender: st.mode === 'public' ? { display_name: g('f-name') || null, organization: g('f-org') || null } : undefined,
        recipient: { agent_address: A.addrOf(st.to) },
        intent: {
          category: data.it.category, objective: data.it.objective, value_proposition: data.it.value, urgency: data.it.urgency, requested_action: data.it.action,
          topics: data.it.tags, stage: data.it.stage || null, round_size_usd: data.it.amount || null, geo: data.it.geo,
        },
        fit_evidence: data.it.evidence.map(function (e) { return { type: e.type, value: e.value }; }),
        message: g('f-msg') || null,
      };
      st.ex = captureEx();
      const btn = document.querySelector('#intent-form button[type="submit"]');
      if (btn) btn.disabled = true;
      A.Live.submit(body).then(function (v) {
        st.view = v; st.token = v.sender_token; st.asked = (v.open_questions || []).length > 0; st.answered = 0;
        st.phase = st.asked ? 'questions' : 'done';
        return st.mode === 'member' ? A.Live.bootstrap() : null;
      }).then(function () { A.refresh(); }, function (e) { if (btn) btn.disabled = false; A.toast(esc(e.message), 'warn'); });
      return;
    }
    const pol = E.policyFor(st.to);
    const r = E.evaluate(data.it, pol, data.sender);
    st.it = data.it; st.sender = data.sender; st.r0 = r; st.r = r; st.answered = 0;
    st.ex = captureEx();
    st.phase = r.lane === 'medium' && r.questions.length ? 'questions' : 'done';
    if (st.phase === 'done') record();
    A.refresh();
  };
  function captureEx() {
    const g = function (id) { const e = document.getElementById(id); return e ? e.value : ''; };
    return {
      cat: g('f-cat'), action: g('f-action'), obj: g('f-obj'), val: g('f-val'), stage: g('f-stage'), amt: g('f-amt'), geo: g('f-geo'), urg: g('f-urg'),
      tags: Array.prototype.map.call(document.querySelectorAll('#f-tags .pill.is-on'), function (b) { return b.dataset.v; }),
      ev: Array.prototype.map.call(document.querySelectorAll('#f-ev .evrow'), function (r) { return [r.querySelector('select').value, r.querySelector('input').value]; }),
    };
  }
  function record() {
    if (st.mode !== 'member') return;
    st.sentId = 's-' + Date.now();
    A.S.sent.unshift({ id: st.sentId, to: st.to, objective: st.it.objective, category: st.it.category, lane: st.r.lane, score: st.r.score, why: st.r.why, when: 'now' });
    A.save();
  }
  A.sub.answers = function (f) {
    const add = Array.prototype.map.call(f.querySelectorAll('input'), function (i) { return { type: i.dataset.t, value: i.value.trim() }; }).filter(function (e) { return e.value; });
    if (!add.length) { A.toast('Answer at least one question.', 'warn'); return; }
    st.answered = add.length;
    if (A.live && st.view) {
      A.Live.answer(st.view.intent_id, st.token, add).then(function (v) {
        st.view = v; st.phase = 'done';
        return st.mode === 'member' ? A.Live.bootstrap() : null;
      }).then(function () { A.refresh(); }, function (e) { A.toast(esc(e.message), 'warn'); });
      return;
    }
    const it = Object.assign({}, st.it, { evidence: st.it.evidence.concat(add) });
    const round = add.filter(function (e) { return e.type === 'round'; })[0];
    if (round && it.category === 'fundraising') {
      const m = /\$?\s?(\d+(?:\.\d+)?)\s?(k|m)?/i.exec(round.value);
      if (m) { let n = parseFloat(m[1]); const u = (m[2] || '').toLowerCase(); n = u === 'm' ? n * 1e6 : u === 'k' ? n * 1e3 : n < 100 ? n * 1e6 : n * 1e3; it.amount = n; }
    }
    st.it = it;
    st.r = E.evaluate(it, E.policyFor(st.to), st.sender);
    st.phase = 'done';
    record();
    A.refresh();
  };
  A.act['f-answer-ex'] = function () {
    document.querySelectorAll('#intent-result input').forEach(function (i) {
      const t = i.dataset.t;
      i.value = { round: '$1.5M allocation alongside our lead', deck: 'Deck, 16 slides', traction: '$12K MRR from 5 paying customers', team: 'Two ex-staff engineers', timeline: 'Kickoff in Q4', time: '30 minutes, remote', fee: 'Honorarium offered', topic: 'On the record, two questions', context: 'We met at Kinetic Harbor Demo Day', audience: '400 founders', mutual_value: 'First look at the cohort', icp: '12 funds like yours', integration: 'Works with your CRM', roi: '6 hours saved per week', reference: 'COO at a peer fund', comp: '€150K plus equity', remote: 'Remote in Europe', teamstage: 'Series A, 40 people', outlet: 'Circuit Weekly', deadline: 'Friday 17:00 CET', confidentiality: 'No NDA needed' }[t] || 'See attached';
    });
  };
  A.act['f-edit'] = function () { st.phase = 'form'; A.refresh(); };
  A.act['f-new'] = function () { st = { to: st.to, mode: st.mode, phase: 'form' }; A.refresh(); };
})(window.ABN);
