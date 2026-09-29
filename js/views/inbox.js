/* Agent Inbox: lanes, explainable decisions, agent-to-agent qualification, human actions */
(function (A) {
  const esc = A.esc, I = A.icon, E = A.Engine;
  let filter = 'all', q = '';
  const ACTION_LABEL = { meet: 'Meeting', reply: 'Reply', intro: 'Introduction', review: 'Review', quote: 'Quote' };
  A.STATUS.delegated = 'Delegated to Jonas';

  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ('00000000' + (h >>> 0).toString(16)).slice(-8);
  }
  function first(p) { return (p.name || 'the sender').split(' ')[0]; }
  function list() {
    let l = E.sort(E.inbox());
    if (q) {
      const s = q.toLowerCase();
      l = l.filter(function (r) { return (r.p.name + ' ' + r.it.objective + ' ' + (A.CATS[r.it.category] || {}).label).toLowerCase().indexOf(s) >= 0; });
    }
    return l;
  }

  function item(r, sel) {
    const d = r.decision, cat = (A.CATS[r.it.category] || A.CATS.other).label;
    return '<a class="ib-item' + (sel ? ' is-sel' : '') + (d && d.status ? ' is-done' : '') + '" href="#inbox.' + r.it.id + '"' + (sel ? ' aria-current="true"' : '') + '>' + A.avatar(r.p, 48) +
      '<span class="ib-item__b"><span class="ib-item__top"><span class="ib-item__nm">' + esc(r.p.name) + '</span><span class="ib-item__tm">' + E.stamp(r.it.ago) + '</span></span>' +
      '<span class="ib-item__obj">' + esc(r.it.objective) + '</span>' +
      '<span class="ib-item__meta">' + A.ui.lane(r.lane) + '<span class="tag">' + esc(cat) + '</span><span class="small muted num">Score ' + r.score + '</span>' +
      (d && d.status ? '<span class="status">' + I('check', 'ico-16') + esc(A.STATUS[d.status] || d.status) + '</span>' : '') +
      (r.overridden ? '<span class="small muted">· moved by you</span>' : '') + '</span></span></a>';
  }
  function listHtml(rows, selId) {
    if (filter === 'sent') {
      if (!A.S.sent.length) return '<div class="pad-24 stack-12"><p class="muted">Intents you send from profiles and agent pages show up here with the recipient agent’s decision.</p><a class="btn btn--secondary btn--sm" href="#send" style="align-self:flex-start">Send an intent</a></div>';
      return A.S.sent.map(function (s) {
        const u = A.P(s.to);
        return '<a class="ib-item' + (selId === s.id ? ' is-sel' : '') + '" href="#inbox.' + s.id + '">' + A.avatar(u, 48) + '<span class="ib-item__b"><span class="ib-item__top"><span class="ib-item__nm">To ' + esc(u.name) + '</span><span class="ib-item__tm">' + esc(s.when) + '</span></span><span class="ib-item__obj">' + esc(s.objective) + '</span><span class="ib-item__meta">' + A.ui.lane(s.lane) + '<span class="small muted num">Score ' + s.score + '</span></span></span></a>';
      }).join('');
    }
    const shown = filter === 'all' ? rows : rows.filter(function (r) { return r.lane === filter; });
    if (!shown.length) return '<div class="pad-24"><p class="muted">Nothing in this lane' + (q ? ' matches “' + esc(q) + '”' : '') + '.</p></div>';
    if (filter !== 'all') return shown.map(function (r) { return item(r, r.it.id === selId); }).join('');
    return E.LANES.map(function (lane) {
      const g = shown.filter(function (r) { return r.lane === lane; });
      if (!g.length) return '';
      return '<div class="ib-group"><div class="ib-lanehdr"><span>' + E.LABEL[lane] + '</span><span class="num">' + g.length + '</span></div>' + g.map(function (r) { return item(r, r.it.id === selId); }).join('') + '</div>';
    }).join('');
  }

  function thread(r) {
    const it = r.it, d = r.decision || {}, p = r.p;
    const me = '<span class="agent-av">' + I('spark') + '</span>';
    const them = function () { return p.kind === 'agent' ? '<span class="agent-av agent-av--ext">' + I('spark') + '</span>' : A.avatar(p, 32); };
    const msg = function (who, text, ago) {
      const mine = who === 'agent';
      return '<div class="msg' + (mine ? ' msg--agent' : '') + '">' + (mine ? me : them()) + '<div class="msg__b"><div class="msg__h"><b>' + (mine ? 'Your agent' : esc(p.name) + (p.kind === 'agent' ? '' : '’s agent')) + '</b>' + (ago != null ? '<span>' + E.ago(ago) + '</span>' : '') + '</div><div class="msg__t">' + esc(text) + '</div></div></div>';
    };
    let h = msg('sender', 'Submitted intent: ' + it.objective, it.ago);
    (it.thread || []).forEach(function (m) { h += msg(m.who, m.t, m.ago); });
    if (d.asked) {
      d.asked.forEach(function (x) { h += msg('agent', x.q, 0); });
      if (A.S.answered[it.id]) d.asked.forEach(function (x) { if (it.answers && it.answers[x.type]) h += msg('sender', it.answers[x.type], 0); });
      else if (d.typing) h += '<div class="msg">' + them() + '<div class="typing" aria-label="Sender’s agent is answering"><i></i><i></i><i></i></div></div>';
      else if (!it.answers) h += '<p class="small muted">The sender has 72 hours to answer. Your agent re-scores the intent when they do.</p>';
    }
    if (r.inj) h += '<div class="msg msg--agent">' + me + '<div class="msg__b"><div class="msg__h"><b>Your agent</b><span>now</span></div><div class="msg__t">Quarantined the message, stopped the conversation and reported the sender. No tools were called.</div></div></div>';
    if (r.lane === 'medium' && !d.asked && r.questions.length) {
      h += '<div class="note">' + I('spark') + '<div class="grow stack-4"><b>Your agent is ready to ask ' + r.questions.length + ' question' + (r.questions.length > 1 ? 's' : '') + '</b><ol style="list-style:decimal;padding-left:18px" class="stack-4">' + r.questions.map(function (x) { return '<li>' + esc(x.q) + '</li>'; }).join('') + '</ol></div></div>';
    }
    return '<div class="thread">' + h + '</div>';
  }

  function actions(r) {
    const d = r.decision || {}, id = r.it.id;
    const b = function (cls, act, label, ic) { return '<button class="btn ' + cls + '" data-act="' + act + '" data-id="' + id + '">' + (ic ? I(ic, 'ico-20') : '') + label + '</button>'; };
    if (d.status) return '<div class="note note--good">' + I('check') + '<div class="grow"><b>' + esc(A.STATUS[d.status] || d.status) + '</b>' + (d.detail ? '<div class="small">' + esc(d.detail) + '</div>' : '') + '</div><button class="btn btn--tertiary btn--sm" data-act="ib-undo" data-id="' + id + '">Undo</button></div>';
    let h = '';
    if (r.lane === 'high') {
      if (r.it.action === 'intro') h = b('btn--primary', 'ib-intro', 'Draft intros', 'users') + b('btn--secondary', 'ib-reply', 'Reply') ;
      else if (r.it.action === 'meet') h = b('btn--primary', 'ib-schedule', 'Schedule safely', 'calendar') + b('btn--secondary', 'ib-reply', 'Reply');
      else h = b('btn--primary', 'ib-reply', 'Accept and reply', 'reply') + b('btn--secondary', 'ib-schedule', 'Schedule');
      h += b('btn--tertiary', 'ib-delegate', 'Delegate') + b('btn--tertiary', 'ib-decline', 'Decline');
    } else if (r.lane === 'medium') {
      if (r.questions.length && !d.asked) h = b('btn--primary', 'ib-ask', 'Send ' + r.questions.length + ' question' + (r.questions.length > 1 ? 's' : ''), 'spark');
      h += b(r.questions.length && !d.asked ? 'btn--secondary' : 'btn--primary', 'ib-escalate', 'Escalate now') + b('btn--tertiary', 'ib-hold', 'Hold for digest') + b('btn--tertiary', 'ib-decline', 'Decline');
    } else if (r.lane === 'low') {
      h = b('btn--primary', 'ib-decline', 'Send polite decline') + b('btn--secondary', 'ib-escalate', 'Escalate anyway') + b('btn--tertiary', 'ib-archive', 'Archive');
    } else if (r.lane === 'declined') {
      h = '<div class="note">' + I('info') + '<div class="grow small">Your agent sent ' + esc(first(r.p)) + ' a decline with this reason: “' + esc(r.why) + '”</div></div>' + b('btn--secondary', 'ib-review', 'Review anyway');
    } else {
      h = b('btn--secondary', 'ib-report', 'Report abuse', 'flag') + b('btn--tertiary', 'ib-review', 'Unblock and review');
    }
    return '<div class="actbar">' + h + '</div>';
  }

  function detail(r) {
    if (!r) return '<div class="dt"><p class="muted">Select an intent to see your agent’s brief.</p></div>';
    const it = r.it, p = r.p, cat = (A.CATS[it.category] || A.CATS.other).label;
    const have = {};
    (it.evidence || []).forEach(function (e) { have[e.type] = true; });
    const req = (A.S.policy.evidence[it.category] || []).filter(function (t) { return !have[t]; });
    const ev = (it.evidence || []).map(function (e) { return '<li class="ev ev--ok">' + I('check') + '<span><b>' + esc((A.EVID[e.type] || { label: e.type }).label) + ':</b> ' + esc(e.value) + '</span></li>'; }).join('') +
      req.map(function (t) { return '<li class="ev ev--miss">' + I('warn') + '<span>Missing: ' + esc((A.EVID[t] || { label: t }).label) + '</span></li>'; }).join('');
    const done = !!A.S.answered[it.id];
    const brief = ((done && it.briefAfter) || it.brief || [r.why]).slice();
    const suggest = (done && it.suggestAfter) || it.suggest || it.alt || r.action;
    const ver = A.S.policy.version;
    return '<div class="dt">' +
      '<a class="btn btn--tertiary btn--sm back-sm" href="#inbox" style="align-self:flex-start">' + I('left', 'ico-16') + 'All intents</a>' +
      '<div class="dt__who"><a href="#in.' + it.from + '" aria-label="' + esc(p.name) + '">' + A.avatar(p, 56) + '</a><div class="grow stack-4"><div class="row wrap" style="gap:6px"><a class="b t16" href="#in.' + it.from + '" style="color:var(--fg)">' + esc(p.name) + '</a>' + (r.verified ? A.verifiedBadge(p.verified.map(function (v) { return A.CLAIMS[v]; }).join(', ')) : '') + A.ui.trust(p) + '</div>' +
        '<div class="small">' + esc(p.headline) + '</div><div class="small muted">' + (p.mutuals || 0) + ' mutual connections · ' + A.ui.verifiedLine(p) + '</div></div>' +
        '<div class="stack-4" style="align-items:center">' + A.ui.gauge(r.score, r.lane) + A.ui.lane(r.lane) + '</div></div>' +
      '<div class="brief"><div class="brief__h">' + I('spark', 'ico-20') + 'Agent brief · 90-second read</div><ul>' + brief.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' +
        '<div class="small"><b>Suggested next step:</b> ' + esc(suggest) + '</div></div>' +
      actions(r) +
      '<div class="dt__sec"><h3>Why ' + E.LABEL[r.lane] + '</h3><p class="small muted">' + esc(r.why) + (r.overridden ? ' You moved this from ' + E.LABEL[r.origLane] + '.' : '') + '</p>' + A.ui.reasons(r) + '</div>' +
      '<div class="dt__sec"><h3>The intent</h3><dl class="kv"><dt>Objective</dt><dd>' + esc(it.objective) + '</dd><dt>Value to you</dt><dd>' + esc(it.value) + '</dd><dt>Requested action</dt><dd>' + (ACTION_LABEL[it.action] || it.action) + '</dd><dt>Category</dt><dd>' + esc(cat) + ((it.tags || []).length ? ' · ' + esc(it.tags.join(', ')) : '') + '</dd>' +
        (it.amount ? '<dt>Round</dt><dd>' + A.money(it.amount) + (it.stage ? ' · ' + esc(it.stage) : '') + (it.note && A.S.answered[it.id] ? ' <span class="small muted">(' + esc(it.note) + ')</span>' : '') + '</dd>' : '') +
        '<dt>Urgency</dt><dd>' + (it.urgency === 'time_sensitive' ? '<b class="lc-medium">Time-sensitive</b>' + (it.deadline ? ' · ' + esc(it.deadline) : '') : it.urgency === 'low' ? 'Low' : 'Normal') + '</dd><dt>Received</dt><dd>' + E.stamp(it.ago) + ' · ' + E.ago(it.ago) + ' ago</dd></dl></div>' +
      '<div class="dt__sec"><h3>Evidence</h3><ul class="ev-list">' + (ev || '<li class="muted">No evidence attached.</li>') + '</ul></div>' +
      '<div class="dt__sec"><h3>Qualification thread</h3>' + thread(r) + '</div>' +
      '<div class="dt__sec"><h3>Score breakdown</h3>' + A.ui.bars(r) + '</div>' +
      '<div class="dt__sec"><h3>Original message</h3>' + (r.inj ? '<div class="small b lc-blocked">Quarantined. Treated as data, never as instructions.</div><div class="quarantine">' + A.ui.injText(it.text, r.inj) + '</div>' : '<div class="rawmsg">' + esc(it.text) + '</div>') + '</div>' +
      '<div class="feedback"><span class="b">Was this routed correctly?</span><button class="btn btn--muted btn--sm" data-act="fb" data-v="ok" data-id="' + it.id + '">Yes</button><button class="btn btn--muted btn--sm" data-act="fb" data-v="up" data-id="' + it.id + '">' + I('up', 'ico-16') + 'Should be higher</button><button class="btn btn--muted btn--sm" data-act="fb" data-v="down" data-id="' + it.id + '">' + I('down', 'ico-16') + 'Should be lower</button></div>' +
      '<div class="small faint mono">policy v' + ver + ' · model triage-small-2 · audit ' + hash(it.id + ver + r.score) + '</div>' +
      '</div>';
  }
  function sentDetail(s) {
    const u = A.P(s.to);
    return '<div class="dt"><a class="btn btn--tertiary btn--sm back-sm" href="#inbox" style="align-self:flex-start">' + I('left', 'ico-16') + 'All intents</a>' +
      '<div class="dt__who">' + A.avatar(u, 56) + '<div class="grow"><div class="b t16">To ' + esc(u.name) + '’s agent</div><div class="small muted">' + esc(u.headline) + '</div></div><div class="stack-4" style="align-items:center">' + A.ui.gauge(s.score, s.lane) + A.ui.lane(s.lane) + '</div></div>' +
      '<div class="brief"><div class="brief__h">' + I('spark', 'ico-20') + 'What happened</div><p>' + esc(s.why) + '</p></div>' +
      '<dl class="kv"><dt>Objective</dt><dd>' + esc(s.objective) + '</dd><dt>Category</dt><dd>' + esc((A.CATS[s.category] || A.CATS.other).label) + '</dd><dt>Sent</dt><dd>' + esc(s.when) + '</dd></dl>' +
      '<div><a class="btn btn--secondary btn--sm" href="#send.' + s.to + '">Send another intent</a></div></div>';
  }

  A.view('inbox', {
    render: function (arg) {
      const rows = list();
      const c = E.counts(E.inbox());
      let sel = null, sent = null;
      if (arg && arg.indexOf('s-') === 0) { sent = A.S.sent.filter(function (s) { return s.id === arg; })[0]; filter = 'sent'; }
      else if (arg) {
        sel = rows.filter(function (r) { return r.it.id === arg; })[0] || E.inbox().filter(function (r) { return r.it.id === arg; })[0];
        if (sel && filter !== 'all' && filter !== sel.lane) filter = 'all';
      }
      if (!sel && !sent && filter !== 'sent') {
        const shown = filter === 'all' ? rows : rows.filter(function (r) { return r.lane === filter; });
        sel = shown[0] || null;
      }
      const total = A.intents.length;
      const pill = function (k, label, n) { return '<button class="pill' + (filter === k ? ' is-on' : '') + '" role="tab" aria-selected="' + (filter === k) + '" data-act="ib-filter" data-k="' + k + '">' + label + (n != null ? ' <span class="cnt">' + n + '</span>' : '') + '</button>'; };
      return '<div class="page"><div class="card card--clip">' +
        '<div class="ibhead"><div class="ibhead__top"><div><h1 class="t20">Agent Inbox</h1><div class="small muted">Your agent screened ' + total + ' intents since yesterday; ' + c.high + ' need you. Policy v' + A.S.policy.version + ' · ' + esc(A.templates[A.S.policy.template].name) + '.</div></div>' +
          '<div class="row wrap"><div class="ibsearch">' + I('search') + '<input id="ib-q" type="search" placeholder="Search intents" aria-label="Search intents" data-in="ib-q" value="' + esc(q) + '"></div><a class="btn btn--secondary btn--sm" href="#policy">' + I('sliders', 'ico-16') + 'Policy</a></div></div>' +
          '<div class="pills" role="tablist" aria-label="Lanes">' + pill('all', 'All', total) + pill('high', 'HIGH', c.high) + pill('medium', 'MEDIUM', c.medium) + pill('low', 'LOW', c.low) + pill('declined', 'Declined', c.declined) + pill('blocked', 'Blocked', c.blocked) + pill('sent', 'Sent', A.S.sent.length) + '</div></div>' +
        '<div class="inbox' + (arg ? ' has-sel' : '') + '"><div class="inbox__list" id="ib-list">' + listHtml(rows, sent ? sent.id : sel && sel.it.id) + '</div><div class="inbox__detail" id="ib-detail">' + (sent ? sentDetail(sent) : detail(sel)) + '</div></div>' +
        '</div></div>';
    },
    mount: function (arg) {
      const s = document.querySelector('.ib-item.is-sel');
      if (s && s.scrollIntoView && arg) { try { s.scrollIntoView({ block: 'nearest' }); } catch (e) { /* ignore */ } }
    },
  });

  // ---------- actions ----------
  function rer() { A.refresh(); A.updateBadges(); }
  function dec(id, patch) { A.S.decisions[id] = Object.assign({}, A.S.decisions[id] || {}, patch); A.save(); }
  function R(id) { return E.inbox().filter(function (r) { return r.it.id === id; })[0]; }
  A.act['ib-filter'] = function (el) { filter = el.dataset.k; A.go('inbox'); };
  A.inp['ib-q'] = function (el) {
    q = el.value;
    const rows = list();
    document.getElementById('ib-list').innerHTML = listHtml(rows, (A.route.arg || ''));
  };
  A.act['ib-ask'] = function (el) {
    const id = el.dataset.id, r = R(id);
    const before = r.score, lane0 = r.lane;
    dec(id, { asked: r.questions.map(function (x) { return { type: x.type, q: x.q }; }), typing: !!r.it.answers });
    rer();
    A.toast('Sent ' + r.questions.length + ' question' + (r.questions.length > 1 ? 's' : '') + ' to ' + esc(r.p.name) + '’s agent.', 'info');
    if (!r.it.answers) return;
    setTimeout(function () {
      A.S.answered[id] = true;
      dec(id, { typing: false });
      const r2 = R(id);
      if (A.route.name === 'inbox') rer();
      A.toast(esc(r.p.name) + '’s agent answered. Re-scored ' + before + ' → ' + r2.score + (r2.lane !== lane0 ? ', moved to <b>' + E.LABEL[r2.lane] + '</b>.' : ', still ' + E.LABEL[r2.lane] + '.'));
    }, 1400);
  };
  A.act['ib-escalate'] = function (el) { dec(el.dataset.id, { lane: 'high', status: null }); rer(); A.toast('Moved to HIGH. Your agent will weigh intents like this higher next time.'); };
  A.act['ib-hold'] = function (el) { dec(el.dataset.id, { status: 'held', detail: 'It will appear in tomorrow’s ' + (A.S.policy.autonomy.digestTime || '08:30') + ' digest.' }); rer(); A.toast('Held for your next digest.'); };
  A.act['ib-archive'] = function (el) { dec(el.dataset.id, { status: 'archived', detail: 'No reply sent. The sender sees “not now”.' }); rer(); A.toast('Archived.'); };
  A.act['ib-report'] = function (el) { dec(el.dataset.id, { status: 'reported', detail: 'Reputation lowered and a network-wide rate limit applied.' }); rer(); A.toast('Reported. The sender’s reputation dropped and their rate limit tightened across the network.'); };
  A.act['ib-review'] = function (el) { dec(el.dataset.id, { lane: 'medium', status: null }); rer(); A.toast('Moved to MEDIUM for your review.', 'info'); };
  A.act['ib-undo'] = function (el) { const id = el.dataset.id; const d = A.S.decisions[id] || {}; A.S.decisions[id] = { asked: d.asked }; A.save(); rer(); A.toast('Undone.', 'info'); };
  A.act.fb = function (el) {
    const id = el.dataset.id, v = el.dataset.v, r = R(id);
    if (v === 'ok') { A.toast('Thanks. Your agent will keep routing intents like this the same way.'); return; }
    const order = ['blocked', 'declined', 'low', 'medium', 'high'];
    let i = order.indexOf(r.lane) + (v === 'up' ? 1 : -1);
    i = Math.max(0, Math.min(order.length - 1, i));
    dec(id, { lane: order[i], status: null });
    rer();
    const topic = (r.it.tags || [])[0] || (A.CATS[r.it.category] || A.CATS.other).label;
    A.toast('Moved to ' + E.LABEL[order[i]] + '. Your agent will weigh “' + esc(topic) + '” ' + (v === 'up' ? 'higher' : 'lower') + ' next time.');
  };

  A.act['ib-reply'] = function (el) {
    const id = el.dataset.id, r = R(id), n = first(r.p);
    const draft = 'Hi ' + n + ',\n\nThanks for the clear intent. ' + (r.it.action === 'meet' ? 'I’d like to take the meeting. My agent will propose times that fit my calendar.' : 'Happy to help here.') + (r.it.id === 'bi-101' ? ' Could you send the benchmark methodology ahead of the call?' : '') + '\n\nMaya';
    A.modal({
      title: 'Reply to ' + esc(r.p.name),
      body: '<div class="note">' + I('spark') + '<div class="small">Your agent drafted this from the brief. Edit anything before sending.</div></div><label class="sr" for="reply-text">Reply</label><textarea class="textarea" id="reply-text" rows="8">' + esc(draft) + '</textarea>',
      foot: '<button class="btn btn--tertiary" data-act="modal-close">Cancel</button><button class="btn btn--primary" data-act="ib-reply-send" data-id="' + id + '">Send reply</button>',
    });
  };
  A.act['ib-reply-send'] = function (el) { const r = R(el.dataset.id); dec(el.dataset.id, { status: 'replied', detail: 'Delivered to ' + r.p.name + '’s agent (simulated).' }); A.closeModal(); rer(); A.toast('Reply delivered to ' + esc(first(r.p)) + '’s agent. In this prototype nothing leaves your browser.'); };

  A.act['ib-schedule'] = function (el) {
    const id = el.dataset.id, r = R(id), slots = E.slots();
    A.modal({
      title: 'Schedule safely with ' + esc(r.p.name),
      body: '<p class="muted small">Slots respect your availability (' + esc(A.S.policy.hours.days + ' ' + A.S.policy.hours.start + '–' + A.S.policy.hours.end + ' ' + A.S.policy.hours.tz) + ') with 15-minute buffers. Your calendar details are not shared.</p>' +
        '<div class="stack" role="radiogroup" aria-label="Proposed slots">' + slots.map(function (s, i) { return '<button class="slot' + (i === 0 ? ' is-on' : '') + '" role="radio" aria-checked="' + (i === 0) + '" data-act="slot" data-v="' + esc(s) + '"><span class="b">' + esc(s) + '</span><span class="small muted">20 min · video</span></button>'; }).join('') + '</div>' +
        '<div class="note note--warn">' + I('lock') + '<div class="small">Your policy requires your approval before your agent schedules anything. Proposing a time is that approval.</div></div>',
      foot: '<button class="btn btn--tertiary" data-act="modal-close">Cancel</button><button class="btn btn--primary" data-act="ib-schedule-send" data-id="' + id + '">Propose time</button>',
    });
  };
  A.act.slot = function (el) { el.parentNode.querySelectorAll('.slot').forEach(function (s) { const on = s === el; s.classList.toggle('is-on', on); s.setAttribute('aria-checked', String(on)); }); };
  A.act['ib-schedule-send'] = function (el) {
    const on = document.querySelector('.slot.is-on'), r = R(el.dataset.id), when = on ? on.dataset.v : '';
    dec(el.dataset.id, { status: 'scheduled', detail: 'Proposed ' + when + '. Waiting for ' + first(r.p) + '’s agent to confirm.' });
    A.closeModal(); rer();
    A.toast('Proposed ' + esc(when) + '. ' + esc(first(r.p)) + '’s agent will confirm.');
  };

  A.act['ib-delegate'] = function (el) {
    const id = el.dataset.id, j = A.P('jonas-lindqvist');
    A.modal({
      title: 'Delegate',
      body: '<p class="muted">Hand this intent to a teammate. They get the brief, the thread and the evidence.</p><div class="row">' + A.avatar(j, 48) + '<div class="grow"><div class="b">' + esc(j.name) + '</div><div class="small muted">' + esc(j.headline) + '</div></div></div><label class="sr" for="deleg-note">Note</label><textarea class="textarea" id="deleg-note" rows="3">Can you take the first call? Strong fit, I’d like your read on the benchmark.</textarea>',
      foot: '<button class="btn btn--tertiary" data-act="modal-close">Cancel</button><button class="btn btn--primary" data-act="ib-delegate-send" data-id="' + id + '">Delegate to Jonas</button>',
    });
  };
  A.act['ib-delegate-send'] = function (el) { dec(el.dataset.id, { status: 'delegated', detail: 'Jonas Lindqvist owns the next step.' }); A.closeModal(); rer(); A.toast('Delegated to Jonas Lindqvist with the brief and thread.'); };

  A.act['ib-intro'] = function (el) {
    const id = el.dataset.id;
    const t = [['daniel-kovac', 'Tensorloom runs heavy spot inference and could validate Latticeforge’s orchestration.'], ['tomas-herrera', 'Vectorbay serves embeddings at scale for analytics customers.']];
    A.modal({
      title: 'Draft double opt-in intros',
      body: '<p class="muted small">Your agent asks each person first. Grace is introduced only to those who say yes.</p>' + t.map(function (x, i) { const u = A.P(x[0]); return '<label class="row-top check" for="intro-' + i + '" style="align-items:flex-start"><input type="checkbox" id="intro-' + i + '" checked>' + A.avatar(u, 40) + '<span class="grow"><b>' + esc(u.name) + '</b><span class="small muted" style="display:block">' + esc(x[1]) + '</span></span></label>'; }).join(''),
      foot: '<button class="btn btn--tertiary" data-act="modal-close">Cancel</button><button class="btn btn--primary" data-act="ib-intro-send" data-id="' + id + '">Send opt-in requests</button>',
    });
  };
  A.act['ib-intro-send'] = function (el) { dec(el.dataset.id, { status: 'intro', detail: 'Opt-in requests sent to Daniel Kovač and Tomás Herrera.' }); A.closeModal(); rer(); A.toast('Opt-in requests sent. Grace gets the intros as soon as both agree.'); };

  A.act['ib-decline'] = function (el) {
    const id = el.dataset.id, r = R(id), n = first(r.p);
    const reasons = [['thesis', 'Outside my thesis'], ['timing', 'Not the right time'], ['info', 'Missing information'], ['size', 'Check size or scope doesn’t fit'], ['no', 'Not interested']];
    const pre = r.overlap.length ? 'timing' : 'thesis';
    const text = function (k) {
      const why = { thesis: (r.it.tags || []).join(', ') + ' is outside Maya’s current thesis', timing: 'Maya can’t take this on right now', info: 'the request is missing details Maya needs to decide', size: 'the size or scope doesn’t fit Maya’s policy', no: 'this isn’t a fit for Maya' }[k];
      return 'Thanks for reaching out, ' + n + '. This isn’t a match right now: ' + why + '.' + (r.it.alt ? ' ' + r.it.alt.replace(/\.$/, '') + '.' : '') + ' You can reply to this thread if anything changes.';
    };
    A.modal({
      title: 'Decline with a reason',
      body: '<p class="muted small">Senders always get a reason. It protects your reputation and helps good senders route better.</p><div class="pills" role="radiogroup" aria-label="Reason">' + reasons.map(function (x) { return '<button class="pill' + (x[0] === pre ? ' is-on' : '') + '" role="radio" aria-checked="' + (x[0] === pre) + '" data-act="decline-reason" data-k="' + x[0] + '">' + x[1] + '</button>'; }).join('') + '</div>' +
        '<label class="label" for="decline-text">Message your agent will send</label><textarea class="textarea" id="decline-text" rows="5">' + esc(text(pre)) + '</textarea>',
      foot: '<button class="btn btn--tertiary" data-act="modal-close">Cancel</button><button class="btn btn--primary" data-act="ib-decline-send" data-id="' + id + '">Send decline</button>',
      mount: function (s) { s._text = text; },
    });
  };
  A.act['decline-reason'] = function (el) {
    const s = document.getElementById('scrim');
    el.parentNode.querySelectorAll('.pill').forEach(function (p) { const on = p === el; p.classList.toggle('is-on', on); p.setAttribute('aria-checked', String(on)); });
    if (s && s._text) document.getElementById('decline-text').value = s._text(el.dataset.k);
  };
  A.act['ib-decline-send'] = function (el) { const r = R(el.dataset.id); dec(el.dataset.id, { status: 'declined', detail: 'Reason delivered to ' + r.p.name + '’s agent.' }); A.closeModal(); rer(); A.toast('Declined politely. ' + esc(first(r.p)) + '’s agent received the reason.'); };
})(window.ABN);
